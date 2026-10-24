import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import { users } from './db'
import type { UserDoc } from './models'
import { subscribe } from './events'
import { bodySchema, readingSchema, validate } from './schemas'
import {
  createReply,
  createRoot,
  deleteAnnotation,
  editAnnotation,
  listAnnotations,
} from './services/annotations'
import { participation } from './services/participation'
import { createReading, getReading, listReadings } from './services/readings'

type Env = { Variables: { user: UserDoc } }

/** No real auth: the caller names a seeded user, and the server looks up their role from its own records. */
const auth = createMiddleware<Env>(async (c, next) => {
  // EventSource can't send headers, so the stream route also accepts ?uid=.
  const uid = c.req.header('x-user-id') ?? c.req.query('uid')
  const user = uid ? await users.findOne({ _id: uid }) : null
  if (!user) throw new HTTPException(401, { message: 'unknown user' })
  c.set('user', user)
  await next()
})

// Anyone can read. Only instructors create readings, and only students write annotations.
const instructorOnly = createMiddleware<Env>(async (c, next) => {
  if (c.get('user').role !== 'instructor')
    throw new HTTPException(403, { message: 'only instructors can do this' })
  await next()
})
const studentOnly = createMiddleware<Env>(async (c, next) => {
  if (c.get('user').role !== 'student')
    throw new HTTPException(403, { message: 'only students can post annotations' })
  await next()
})

/**
 * ONE chained expression. Each `.get/.post/...` returns a Hono type that accumulates the route's
 * path, validated input and JSON output, so `typeof app` is the full API contract. The Vue app
 * imports that type and gets a typed client from `hc<AppType>` — no codegen, no hand-written types.
 * (Don't split this into `app.get(...); app.post(...)` statements: that discards the accumulation.)
 */
export const app = new Hono<Env>()
  .basePath('/api')
  .onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
    console.error(error)
    return c.json({ error: 'Something went wrong on the server. Please try again.' }, 500)
  })
  .use('/readings/*', auth)
  .use('/annotations/*', auth)
  .use('/participation', auth)

  // Seeded identities for the user-switcher (stand-in for login).
  .get('/users', async (c) => {
    const list = await users.find().sort({ _id: 1 }).toArray()
    return c.json(list.map(({ _id, name, role }) => ({ id: _id, name, role })))
  })

  .get('/readings', async (c) => c.json(await listReadings()))

  // The instructor's dashboard: every student's annotation count on every reading.
  .get('/participation', instructorOnly, async (c) => c.json(await participation()))

  .post('/readings', instructorOnly, validate('json', readingSchema), async (c) =>
    c.json(await createReading(c.get('user'), c.req.valid('json')), 201),
  )

  .get('/readings/:id', async (c) => c.json(await getReading(c.req.param('id'))))

  .get('/readings/:id/annotations', async (c) => c.json(await listAnnotations(c.req.param('id'))))

  // Each write returns the saved annotation (so the author's UI updates immediately) and is also pushed
  // to everyone viewing the reading over its SSE stream.
  .post('/readings/:id/annotations', studentOnly, validate('json', bodySchema), async (c) =>
    c.json(await createRoot(c.get('user'), c.req.param('id'), c.req.valid('json').body), 201),
  )

  .post('/annotations/:id/replies', studentOnly, validate('json', bodySchema), async (c) =>
    c.json(await createReply(c.get('user'), c.req.param('id'), c.req.valid('json').body), 201),
  )

  .patch('/annotations/:id', studentOnly, validate('json', bodySchema), async (c) =>
    c.json(await editAnnotation(c.get('user'), c.req.param('id'), c.req.valid('json').body)),
  )

  .delete('/annotations/:id', studentOnly, async (c) =>
    c.json(await deleteAnnotation(c.get('user'), c.req.param('id'))),
  )

  // Live updates for one reading. The client reloads the full list whenever this (re)connects, so the
  // stream only carries what happens while it's open.
  .get('/readings/:id/stream', (c) =>
    streamSSE(c, async (stream) => {
      // Write something right away: proxies (including Vite's dev proxy) hold the response headers
      // until the first body bytes, and the client only loads the list once the stream has opened.
      // `retry` also tells the browser to wait 3s between reconnect attempts.
      await stream.write('retry: 3000\n\n')
      // Each message's data is one AnnotationEvent (events.ts); the client imports that type.
      const unsubscribe = subscribe(c.req.param('id'), (event) => {
        // A write racing a disconnect rejects; the stream is closing anyway, so drop it.
        stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {})
      })
      // Hold the response open until the browser disconnects.
      await new Promise<void>((resolve) => stream.onAbort(resolve))
      unsubscribe()
    }),
  )

export type AppType = typeof app
