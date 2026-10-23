import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
const OTHER_DOC = 'on-liberty-ch2'
const alice = { _id: 'u-alice', name: 'Alice Chen', role: 'student' } as const
const bob = { _id: 'u-bob', name: 'Bob Okafor', role: 'student' } as const

const waitFor = async (pred: () => boolean, ms = 5000) => {
  const t = Date.now()
  while (!pred()) {
    if (Date.now() - t > ms) throw new Error('timed out waiting for condition')
    await new Promise(r => setTimeout(r, 20))
  }
}

const post = (u: typeof alice | typeof bob, body = 'a perfectly substantive comment', doc = DOC) => m.svc.createRoot(u, doc, body)

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
  m.hub.hub.start()
  await m.hub.hub.started
}, 120_000)

afterAll(async () => {
  await m.hub.hub.stop()
  await m.db.mongo.close()
  await rs.stop()
})

describe('sequencing', () => {
  it('assigns unique, gapless, per-document seqs under concurrent writers', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => post(i % 2 ? alice : bob)))
    const seqs = results.map(r => r.seq).sort((a, b) => a - b)
    expect(seqs).toEqual(Array.from({ length: 12 }, (_, i) => i + 1))
    await post(alice, 'elsewhere', OTHER_DOC) // other document = independent channel, starts at 1
    expect(await m.svc.currentSeq(OTHER_DOC)).toBe(1)
    expect(await m.svc.currentSeq(DOC)).toBe(12)
  })
})

describe('fan-out', () => {
  it("delivers to that document's subscribers only", async () => {
    const got = { doc: [] as SseMessage[], other: [] as SseMessage[] }
    const subDoc = await m.hub.hub.subscribe(DOC, undefined, e => got.doc.push(e))
    const subOther = await m.hub.hub.subscribe(OTHER_DOC, undefined, e => got.other.push(e))
    const created = await post(bob, 'only for this reading')
    await waitFor(() => got.doc.length === 1)
    expect(got.doc[0]).toMatchObject({ id: created.seq, event: 'annotation' })
    expect(JSON.parse(got.doc[0].data).body).toBe('only for this reading')
    await new Promise(r => setTimeout(r, 300))
    expect(got.other).toHaveLength(0)
    subDoc.close(); subOther.close()
  })
})

describe('validation', () => {
  it('rejects empty or whitespace-only annotations and trims the rest', async () => {
    const { bodySchema } = await import('./schemas')
    expect(bodySchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(bodySchema.safeParse({ body: '  ok ' }).data).toEqual({ body: 'ok' })
  })
})

describe('replay + self-healing', () => {
  it('replays exactly what a reconnecting client missed (Last-Event-ID)', async () => {
    const before = await m.svc.currentSeq(DOC)
    const r1 = await post(alice)
    const r2 = await post(bob)
    const got: SseMessage[] = []
    const s = await m.hub.hub.subscribe(DOC, before, e => got.push(e))
    expect(got.map(e => e.id)).toEqual([r1.seq, r2.seq])
    s.close()
  })

  it('heals a dropped broadcast: a live event past a gap triggers a replay of the hole', async () => {
    const mark = await m.svc.currentSeq(DOC)
    await post(alice); await post(alice); await post(alice)
    const docs = await m.db.annotations.find({ documentId: DOC, seq: { $gt: mark } }).sort({ seq: 1 }).toArray()
    const got: SseMessage[] = []
    const sub = new m.hub.Subscriber(DOC, mark, e => got.push(e))
    sub.deliver(docs[2]) // pretend broadcasts for docs[0] and docs[1] were dropped
    await waitFor(() => got.length === 3)
    expect(got.map(e => e.id)).toEqual(docs.map(d => d.seq))
    sub.deliver(docs[1]) // late duplicate is ignored
    await new Promise(r => setTimeout(r, 50))
    expect(got).toHaveLength(3)
  })

  it('tells a client from the future to resync', async () => {
    const got: SseMessage[] = []
    const s = await m.hub.hub.subscribe(DOC, 99999, e => got.push(e))
    expect(got[0].event).toBe('resync')
    s.close()
  })
})

describe('change stream restart', () => {
  it('converges after the stream dies and writes happen while it is down', async () => {
    const got: SseMessage[] = []
    const s = await m.hub.hub.subscribe(DOC, undefined, e => got.push(e))
    const live = await post(alice, 'delivered over the live stream')
    await waitFor(() => got.some(e => e.id === live.seq))

    // Kill the change stream out from under the hub (what a network blip or failover looks like).
    await (m.hub.hub as unknown as { stream: { close(): Promise<void> } }).stream.close()
    // Writes during the outage never reach the (dead) stream; they exist only in MongoDB.
    const missed = [await post(bob, 'written while down 1'), await post(alice, 'written while down 2'), await post(bob, 'written while down 3')]

    // The hub reconnects and runs catch-up for every subscriber, sourcing the gap from MongoDB.
    await waitFor(() => missed.every(r => got.some(e => e.id === r.seq)), 10_000)

    // The recovered stream is live again, too.
    const after = await post(alice, 'after recovery')
    await waitFor(() => got.some(e => e.id === after.seq))

    const ids = got.map(e => e.id!)
    expect(ids).toEqual([...new Set(ids)]) // no duplicates
    expect(ids).toEqual([...ids].sort((a, b) => a - b)) // still in order
    expect(ids.slice(-5)).toEqual([live.seq, ...missed.map(r => r.seq), after.seq])
    s.close()
  }, 20_000)
})

describe('edit + delete', () => {
  it('broadcasts an edit live and replays it, at a new seq', async () => {
    const root = await post(alice, 'original wording of the comment')
    const mark = await m.svc.currentSeq(DOC)
    const got: SseMessage[] = []
    const live = await m.hub.hub.subscribe(DOC, undefined, e => got.push(e))

    const edited = await m.svc.editAnnotation(alice, root._id, 'revised wording of the comment')
    await waitFor(() => got.length === 1)
    expect(JSON.parse(got[0].data)).toMatchObject({ id: root._id, body: 'revised wording of the comment', seq: mark + 1 })
    expect(JSON.parse(got[0].data).editedAt).not.toBeNull()
    expect(edited.seq).toBe(mark + 1)
    live.close()

    const replayed: SseMessage[] = []
    const re = await m.hub.hub.subscribe(DOC, mark, e => replayed.push(e))
    expect(replayed.map(e => JSON.parse(e.data).body)).toEqual(['revised wording of the comment'])
    re.close()
  })

  it('only the author may edit or delete', async () => {
    const root = await post(alice)
    const seq = await m.svc.currentSeq(DOC)
    await expect(m.svc.editAnnotation(bob, root._id, 'hijack')).rejects.toMatchObject({ status: 403 })
    await expect(m.svc.deleteAnnotation(bob, root._id)).rejects.toMatchObject({ status: 403 })
    expect(await m.svc.currentSeq(DOC)).toBe(seq) // rejected writes burn no sequence numbers
    expect((await m.db.annotations.findOne({ _id: root._id }))!.body).toBe('a perfectly substantive comment')
  })

  it('a client that was offline during a delete still learns of it on reconnect (tombstone replay)', async () => {
    const root = await post(alice, 'this one will be deleted')
    const mark = await m.svc.currentSeq(DOC) // the offline client last saw this
    const t = await m.svc.deleteAnnotation(alice, root._id)

    expect(t).toMatchObject({ body: '', seq: mark + 1 })
    expect(t.deletedAt).toBeInstanceOf(Date)

    const replayed: SseMessage[] = []
    const re = await m.hub.hub.subscribe(DOC, mark, e => replayed.push(e))
    expect(replayed).toHaveLength(1)
    expect(JSON.parse(replayed[0].data)).toMatchObject({ id: root._id, body: '' })
    expect(JSON.parse(replayed[0].data).deletedAt).not.toBeNull()
    re.close()
  })

  it('deleted posts are inert: no edit or reply, and double-delete is a 404', async () => {
    const root = await post(alice)
    await m.svc.deleteAnnotation(alice, root._id)
    await expect(m.svc.editAnnotation(alice, root._id, 'zombie')).rejects.toMatchObject({ status: 404 })
    await expect(m.svc.createReply(bob, root._id, 'anyone there?')).rejects.toMatchObject({ status: 404 })
    await expect(m.svc.deleteAnnotation(alice, root._id)).rejects.toMatchObject({ status: 404 })
  })

  it('deleting a root keeps its replies', async () => {
    const root = await post(alice)
    const reply = await m.svc.createReply(bob, root._id, 'a reply that should survive its parent')
    await m.svc.deleteAnnotation(alice, root._id)
    const snap = await m.svc.snapshot(DOC)
    expect(snap.annotations.find(a => a.id === reply._id)).toMatchObject({ body: 'a reply that should survive its parent', deletedAt: null })
  })
})
