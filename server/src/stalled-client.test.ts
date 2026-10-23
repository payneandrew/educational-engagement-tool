import { serve } from '@hono/node-server'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import net from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// End-to-end over real TCP: one client opens the SSE stream and never reads a byte (a dead phone, a
// suspended tab). The server must cut it off rather than buffer for it forever, and a healthy client
// on the same channel must be unaffected.
let rs: MongoMemoryReplSet
let server: ReturnType<typeof serve>
let port: number
let m: { db: typeof import('./db'); svc: typeof import('./services/annotations'); hub: typeof import('./realtime/hub') }

const DOC = 'civil-disobedience'
const alice = { _id: 'u-alice', name: 'Alice Chen', role: 'student' } as const

const waitFor = async (pred: () => boolean, ms: number) => {
  const t = Date.now()
  while (!pred()) {
    if (Date.now() - t > ms) throw new Error('timed out waiting for condition')
    await new Promise(r => setTimeout(r, 50))
  }
}

function openRawStream(userId: string, { read }: { read: boolean }) {
  const sock = net.connect(port, '127.0.0.1')
  const state = { events: 0, closed: false }
  sock.write(`GET /api/readings/${DOC}/stream HTTP/1.1\r\nHost: x\r\nx-user-id: ${userId}\r\n\r\n`)
  sock.on('close', () => (state.closed = true))
  sock.on('error', () => {})
  if (read) sock.on('data', d => (state.events += d.toString().split('event: annotation').length - 1))
  else sock.pause() // never read: the kernel buffers fill, the server's writes stop completing
  return { sock, state }
}

beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ binary: { version: '7.0.14' }, replSet: { count: 1 } })
  process.env.MONGO_URI = rs.getUri()
  process.env.SSE_MAX_PENDING = '20'
  const { app } = await import('./app')
  m = { db: await import('./db'), svc: await import('./services/annotations'), hub: await import('./realtime/hub') }
  await m.db.initDb()
  await (await import('./seed')).seed()
  await m.db.annotations.deleteMany({})
  await m.db.counters.deleteMany({})
  m.hub.hub.start()
  await m.hub.hub.started
  await new Promise<void>(res => {
    server = serve({ fetch: app.fetch, port: 0 }, i => ((port = i.port), res()))
  })
}, 120_000)

afterAll(async () => {
  server?.close()
  await m.hub.hub.stop()
  await m.db.mongo.close()
  await rs.stop()
})

describe('stalled client', () => {
  it('is disconnected once its unsent writes exceed the cap; healthy clients keep receiving', async () => {
    const stalled = openRawStream('u-bob', { read: false })
    const healthy = openRawStream('u-alice', { read: true })
    await waitFor(() => m.hub.hub.subscriberCount === 2, 5000)

    // Big bodies so the stalled client's socket buffers fill quickly.
    const body = 'x'.repeat(4900)
    let posted = 0
    const start = Date.now()
    while (m.hub.hub.subscriberCount === 2 && Date.now() - start < 40_000) {
      await m.svc.createRoot(alice, DOC, body)
      posted++
    }

    // The server dropped the stalled subscriber (and the connection) on its own...
    expect(m.hub.hub.subscriberCount).toBe(1)
    // ...while the healthy client got every event that was posted.
    await waitFor(() => healthy.state.events >= posted, 10_000)
    expect(healthy.state.closed).toBe(false)

    // And the stalled client can come back and catch up from MongoDB: nothing was lost, only delayed.
    const got: number[] = []
    const re = await m.hub.hub.subscribe(DOC, 0, e => e.id && got.push(e.id))
    expect(got).toHaveLength(posted)
    re.close()

    stalled.sock.destroy()
    healthy.sock.destroy()
    console.log(`stalled client cut off after ${posted} posts (${((posted * 4900) / 1024 / 1024).toFixed(1)} MB)`)
  }, 60_000)
})
