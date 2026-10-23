import { Hono } from 'hono'
import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { streamSSE } from 'hono/streaming'
import { users } from './db'
import type { UserDoc } from './models'
import { boundedSender } from './realtime/bounded-sender'
import { hub } from './realtime/hub'
import { bodySchema, idParam, readingSchema, streamQuery, validate } from './schemas'
import { createReply, createRoot, deleteAnnotation, editAnnotation, snapshot, toDTO } from './services/annotations'
import { AppError } from './services/errors'
import { createReading, getReading, listReadings } from './services/readings'

type Env = { Variables: { user: UserDoc } }

export const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 20_000)
/** Max unsent writes per SSE client before we cut it off (see bounded-sender.ts). */
export const MAX_PENDING_WRITES = Number(process.env.SSE_MAX_PENDING ?? 500)

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

  .get('/health', c => c.json({ ok: true, subscribers: hub.subscriberCount }))

  // Seeded identities for the user-switcher (stand-in for login).
  .get('/users', async c => c.json(await users.find().sort({ _id: 1 }).toArray()))

  .get('/readings', async c => c.json(await listReadings()))

  .post('/readings', instructorOnly, validate('json', readingSchema), async c =>
    c.json(await createReading(c.get('user'), c.req.valid('json')), 201),
  )

  .get('/readings/:id', validate('param', idParam), async c => c.json(await getReading(c.req.valid('param').id)))

  .get('/readings/:id/annotations', validate('param', idParam), async c => c.json(await snapshot(c.req.valid('param').id)))

  .post('/readings/:id/annotations', validate('param', idParam), validate('json', bodySchema), async c => {
    const user = asStudent(c.get('user'))
    const created = await createRoot(user, c.req.valid('param').id, c.req.valid('json').body)
    // Persisted; the change stream fans it out. No broadcast call here, so there's no
    // "saved but not sent" window — whatever is in Mongo is what subscribers converge to.
    return c.json(toDTO(created), 201)
  })

  .post('/annotations/:id/replies', validate('param', idParam), validate('json', bodySchema), async c => {
    const user = asStudent(c.get('user'))
    return c.json(toDTO(await createReply(user, c.req.valid('param').id, c.req.valid('json').body)), 201)
  })

  .patch('/annotations/:id', validate('param', idParam), validate('json', bodySchema), async c => {
    const user = asStudent(c.get('user'))
    return c.json(toDTO(await editAnnotation(user, c.req.valid('param').id, c.req.valid('json').body)))
  })

  // Returns the tombstone (not 204) so the caller can apply it by id exactly like a live event.
  .delete('/annotations/:id', validate('param', idParam), async c => {
    const user = asStudent(c.get('user'))
    return c.json(toDTO(await deleteAnnotation(user, c.req.valid('param').id)))
  })

  .get('/readings/:id/stream', validate('param', idParam), validate('query', streamQuery), c => {
    const user = c.get('user')
    const documentId = c.req.valid('param').id
    const header = Number.parseInt(c.req.header('Last-Event-ID') ?? '', 10)
    const lastEventId = Number.isFinite(header) ? header : c.req.valid('query').lastEventId

    c.header('X-Accel-Buffering', 'no') // nginx: don't buffer the stream
    return streamSSE(c, async stream => {
      // All writes (events + heartbeats) go through one bounded queue per client. A client that stops
      // draining gets disconnected instead of growing this process's memory; it replays on reconnect.
      let closeSub = () => {}
      const out = boundedSender({
        max: MAX_PENDING_WRITES,
        onOverflow: () => {
          console.warn(`[sse] dropping stalled client (user ${user._id}, >${MAX_PENDING_WRITES} unsent writes)`)
          closeSub()
          stream.abort()
        },
      })

      await stream.write('retry: 3000\n\n')
      const { close } = await hub.subscribe(documentId, lastEventId, m =>
        out.send(() => stream.writeSSE({ id: m.id === undefined ? undefined : String(m.id), event: m.event, data: m.data })),
      )
      closeSub = close
      stream.onAbort(close)

      // Comment lines (": ...") are ignored by EventSource but keep idle proxies from closing the socket.
      while (!stream.aborted) {
        await stream.sleep(HEARTBEAT_MS)
        if (!stream.aborted) out.send(() => stream.write(': heartbeat\n\n'))
      }
      close()
    })
  })


export type AppType = typeof app
