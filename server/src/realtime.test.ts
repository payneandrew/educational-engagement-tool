import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAnchor } from '../../shared/anchor'
import type { SseMessage } from './realtime/hub'

// Real MongoDB (replica set: change streams + transactions). Imports are dynamic so MONGO_URI is set first.
let rs: MongoMemoryReplSet
let m: {
  db: typeof import('./db')
  svc: typeof import('./services/annotations')
  hub: typeof import('./realtime/hub')
  seed: typeof import('./seed')
}

const DOC = 'civil-disobedience'
const alice = { _id: 'u-alice', name: 'Alice Chen', role: 'student', groupId: 'g-a' } as const
const bob = { _id: 'u-bob', name: 'Bob Okafor', role: 'student', groupId: 'g-a' } as const
const carol = { _id: 'u-carol', name: 'Carol Silva', role: 'student', groupId: 'g-b' } as const

const waitFor = async (pred: () => boolean, ms = 5000) => {
  const t = Date.now()
  while (!pred()) {
    if (Date.now() - t > ms) throw new Error('timed out waiting for condition')
    await new Promise(r => setTimeout(r, 20))
  }
}

let text = ''
const post = async (u: typeof alice | typeof carol | typeof bob, body = 'a perfectly substantive comment') =>
  m.svc.createRoot(u, DOC, { anchor: createAnchor(text, 10, 30), body })

beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ binary: { version: '7.0.14' }, replSet: { count: 1 } })
  process.env.MONGO_URI = rs.getUri()
  m = {
    db: await import('./db'),
    svc: await import('./services/annotations'),
    hub: await import('./realtime/hub'),
    seed: await import('./seed'),
  }
  await m.db.initDb()
  await m.seed.seed()
  await m.db.annotations.deleteMany({})
  await m.db.counters.deleteMany({})
  text = (await m.db.documents.findOne({ _id: DOC }))!.text
  m.hub.hub.start()
  await m.hub.hub.started
}, 120_000)

afterAll(async () => {
  await m.hub.hub.stop()
  await m.db.mongo.close()
  await rs.stop()
})

describe('sequencing', () => {
  it('assigns unique, gapless, per-channel seqs under concurrent writers', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => post(i % 2 ? alice : bob)))
    const seqs = results.map(r => r.seq).sort((a, b) => a - b)
    expect(seqs).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    await post(carol) // other group = independent channel, starts at 1
    expect(await m.svc.currentSeq(DOC, 'g-b')).toBe(1)
    expect(await m.svc.currentSeq(DOC, 'g-a')).toBe(12)
  })
})

describe('fan-out + group scoping', () => {
  it('delivers to same-group subscribers only', async () => {
    const got = { a: [] as SseMessage[], b: [] as SseMessage[] }
    const subA = await m.hub.hub.subscribe(DOC, 'g-a', undefined, e => got.a.push(e))
    const subB = await m.hub.hub.subscribe(DOC, 'g-b', undefined, e => got.b.push(e))
    const created = await post(bob, 'visible to group A only')
    await waitFor(() => got.a.length === 1)
    expect(got.a[0]).toMatchObject({ id: created.seq, event: 'annotation' })
    expect(JSON.parse(got.a[0].data).body).toBe('visible to group A only')
    await new Promise(r => setTimeout(r, 300))
    expect(got.b).toHaveLength(0)
    subA.close(); subB.close()
  })

  it("won't let one group read or reply into another's thread", async () => {
    const root = await post(alice)
    await expect(m.svc.createReply(carol, root._id, 'sneaky')).rejects.toMatchObject({ status: 404 })
    await expect(m.svc.toggleUpvote(carol, root._id)).rejects.toMatchObject({ status: 404 })
    expect((await m.svc.snapshot(DOC, 'g-b')).annotations.every(a => a.groupId === 'g-b')).toBe(true)
  })
})

describe('replay + self-healing', () => {
  it('replays exactly what a reconnecting client missed (Last-Event-ID)', async () => {
    const before = await m.svc.currentSeq(DOC, 'g-a')
    const r1 = await post(alice)
    const r2 = await post(bob)
    const got: SseMessage[] = []
    const s = await m.hub.hub.subscribe(DOC, 'g-a', before, e => got.push(e))
    expect(got.map(e => e.id)).toEqual([r1.seq, r2.seq])
    s.close()
  })

  it('replays an upvote as the post at its new seq (state-based, idempotent by id)', async () => {
    const root = await post(alice)
    const mark = await m.svc.currentSeq(DOC, 'g-a')
    await m.svc.toggleUpvote(bob, root._id)
    const got: SseMessage[] = []
    const s = await m.hub.hub.subscribe(DOC, 'g-a', mark, e => got.push(e))
    expect(got).toHaveLength(1)
    expect(JSON.parse(got[0].data)).toMatchObject({ id: root._id, upvoterIds: ['u-bob'], seq: mark + 1 })
    s.close()
  })

  it('heals a dropped broadcast: a live event past a gap triggers a replay of the hole', async () => {
    const mark = await m.svc.currentSeq(DOC, 'g-a')
    await post(alice); await post(alice); await post(alice)
    const docs = await m.db.annotations.find({ documentId: DOC, groupId: 'g-a', seq: { $gt: mark } }).sort({ seq: 1 }).toArray()
    const got: SseMessage[] = []
    const sub = new m.hub.Subscriber(DOC, 'g-a', mark, e => got.push(e))
    sub.deliver(docs[2]) // pretend broadcasts for docs[0] and docs[1] were dropped
    await waitFor(() => got.length === 3)
    expect(got.map(e => e.id)).toEqual(docs.map(d => d.seq))
    sub.deliver(docs[1]) // late duplicate is ignored
    await new Promise(r => setTimeout(r, 50))
    expect(got).toHaveLength(3)
  })

  it('tells a client from the future to resync', async () => {
    const got: SseMessage[] = []
    const s = await m.hub.hub.subscribe(DOC, 'g-a', 99999, e => got.push(e))
    expect(got[0].event).toBe('resync')
    s.close()
  })
})
