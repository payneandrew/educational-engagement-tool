import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import { users } from './db'
import type { UserDoc } from './models'
import { subscribe, subscriberCount } from './events'
import { bodySchema, idParam, readingSchema, validate } from './schemas'
import { createReply, createRoot, deleteAnnotation, editAnnotation, listAnnotations } from './services/annotations'
import { AppError } from './services/errors'
import { createReading, getReading, listReadings } from './services/readings'

type Env = { Variables: { user: UserDoc } }

export const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 20_000)

/** No real auth: the caller names a seeded user, and the server looks up their role from its own records. */
const auth = createMiddleware<Env>(async (c, next) => {
  // EventSource can't send headers, so the stream route also accepts ?uid=.
  const uid = c.req.header('x-user-id') ?? c.req.query('uid')
  const user = uid ? await users.findOne({ _id: uid }) : null
  if (!user) throw new HTTPException(401, { message: 'unknown user' })
  c.set('user', user)
  await next()
})

const instructorOnly = createMiddleware<Env>(async (c, next) => {
  if (c.get('user').role !== 'instructor') throw new HTTPException(403, { message: 'only instructors can create readings' })
  await next()
})

/** Anyone can read a discussion; only students write to one. */
const asStudent = (u: UserDoc) => {
  if (u.role !== 'student') throw new HTTPException(403, { message: 'only students can post annotations' })
  return u
}

/**
 * ONE chained expression. Each `.get/.post/...` returns a Hono type that accumulates the route's
 * path, validated input and JSON output, so `typeof app` is the full API contract. The Vue app
 * imports that type and gets a typed client from `hc<AppType>` — no codegen, no hand-written types.
 * (Don't split this into `app.get(...); app.post(...)` statements: that discards the accumulation.)
 */
export const app = new Hono<Env>()
  .basePath('/api')
  .onError((err, c) => {
    if (err instanceof AppError) return c.json({ error: err.message }, err.status)
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status)
    console.error(err)
    return c.json({ error: 'internal error' }, 500)
  })
  .use('/readings/*', auth)
  .use('/annotations/*', auth)

  .get('/health', c => c.json({ ok: true, subscribers: subscriberCount() }))

  // Seeded identities for the user-switcher (stand-in for login).
  .get('/users', async c => c.json(await users.find().sort({ _id: 1 }).toArray()))

  .get('/readings', async c => c.json(await listReadings()))

  .post('/readings', instructorOnly, validate('json', readingSchema), async c =>
    c.json(await createReading(c.get('user'), c.req.valid('json')), 201),
  )

  .get('/readings/:id', validate('param', idParam), async c => c.json(await getReading(c.req.valid('param').id)))

  .get('/readings/:id/annotations', validate('param', idParam), async c => c.json(await listAnnotations(c.req.valid('param').id)))

  // Each write returns the saved annotation (so the author's UI updates immediately) and is also pushed
  // to everyone viewing the reading over its SSE stream.
  .post('/readings/:id/annotations', validate('param', idParam), validate('json', bodySchema), async c => {
    const user = asStudent(c.get('user'))
    return c.json(await createRoot(user, c.req.valid('param').id, c.req.valid('json').body), 201)
  })

  .post('/annotations/:id/replies', validate('param', idParam), validate('json', bodySchema), async c => {
    const user = asStudent(c.get('user'))
    return c.json(await createReply(user, c.req.valid('param').id, c.req.valid('json').body), 201)
  })

  .patch('/annotations/:id', validate('param', idParam), validate('json', bodySchema), async c => {
    const user = asStudent(c.get('user'))
    return c.json(await editAnnotation(user, c.req.valid('param').id, c.req.valid('json').body))
  })

  .delete('/annotations/:id', validate('param', idParam), async c => {
    const user = asStudent(c.get('user'))
    return c.json(await deleteAnnotation(user, c.req.valid('param').id))
  })

  // Live updates for one reading. The client loads the full list whenever this (re)connects, so the
  // stream only has to carry what happens while it's open.
  .get('/readings/:id/stream', validate('param', idParam), c => {
    const documentId = c.req.valid('param').id
    c.header('X-Accel-Buffering', 'no') // nginx: don't buffer the stream
    return streamSSE(c, async stream => {
      await stream.write('retry: 3000\n\n')
      const unsubscribe = subscribe(documentId, event => {
        const data = JSON.stringify(event.type === 'annotation' ? event.annotation : event.ids)
        // A write racing a disconnect rejects; the abort handler below cleans up, so just drop it.
        stream.writeSSE({ event: event.type, data }).catch(() => {})
      })
      stream.onAbort(unsubscribe)
      // Comment lines (": ...") are ignored by EventSource but keep idle proxies from closing the socket.
      while (!stream.aborted) {
        await stream.sleep(HEARTBEAT_MS)
        if (!stream.aborted) await stream.write(': heartbeat\n\n')
      }
      unsubscribe()
    })
  })

export type AppType = typeof app
