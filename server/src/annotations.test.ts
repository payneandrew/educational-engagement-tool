import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AnnotationEvent } from './events'

// Real (throwaway) MongoDB. Imports are dynamic so MONGO_URI is set before db.ts reads it.
let mongod: MongoMemoryServer
let m: {
  db: typeof import('./db')
  svc: typeof import('./services/annotations')
  events: typeof import('./events')
}

const READING = 'civil-disobedience'
const OTHER_READING = 'on-liberty-ch2'
const alice = { _id: 'u-alice', name: 'Alice Chen', role: 'student' } as const
const bob = { _id: 'u-bob', name: 'Bob Okafor', role: 'student' } as const

/** Collects the events published for one reading. */
function listen(readingId: string) {
  const got: AnnotationEvent[] = []
  const stop = m.events.subscribe(readingId, (e) => got.push(e))
  return { got, stop }
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  process.env.MONGO_URI = mongod.getUri()
  m = {
    db: await import('./db'),
    svc: await import('./services/annotations'),
    events: await import('./events'),
  }
  await m.db.initDb()
  await (await import('./seed')).seed()
}, 120_000)

beforeEach(async () => {
  await m.db.annotations.deleteMany({})
})

afterAll(async () => {
  await m.db.mongo.close()
  await mongod.stop()
})

describe('live events', () => {
  it("publishes a new annotation to that reading's viewers only", async () => {
    const here = listen(READING)
    const elsewhere = listen(OTHER_READING)
    const created = await m.svc.createRoot(alice, READING, 'only for this reading')
    expect(here.got).toEqual([{ type: 'annotation', annotation: created }])
    expect(elsewhere.got).toEqual([])
    here.stop()
    elsewhere.stop()
  })

  it('publishes edits, marked as edited', async () => {
    const root = await m.svc.createRoot(alice, READING, 'original wording')
    const { got, stop } = listen(READING)
    await m.svc.editAnnotation(alice, root.id, 'revised wording')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({
      type: 'annotation',
      annotation: { id: root.id, body: 'revised wording' },
    })
    expect(got[0].type === 'annotation' && got[0].annotation.editedAt).toBeTruthy()
    stop()
  })

  it('stops delivering after unsubscribe', async () => {
    const { got, stop } = listen(READING)
    stop()
    await m.svc.createRoot(alice, READING, 'nobody is listening')
    expect(got).toEqual([])
  })
})

describe('delete', () => {
  it('deleting a top-level annotation also deletes its replies, and says so', async () => {
    const root = await m.svc.createRoot(alice, READING, 'opening comment')
    const reply = await m.svc.createReply(bob, root.id, 'a reply')
    const { got, stop } = listen(READING)

    const { ids } = await m.svc.deleteAnnotation(alice, root.id)

    expect(ids.sort()).toEqual([root.id, reply.id].sort())
    expect(got).toEqual([{ type: 'deleted', ids }])
    expect(await m.svc.listAnnotations(READING)).toEqual([])
    stop()
  })

  it('deleting a reply leaves the thread alone', async () => {
    const root = await m.svc.createRoot(alice, READING, 'opening comment')
    const reply = await m.svc.createReply(bob, root.id, 'a reply')
    await m.svc.deleteAnnotation(bob, reply.id)
    expect((await m.svc.listAnnotations(READING)).map((a) => a.id)).toEqual([root.id])
  })
})

describe('rules', () => {
  it('only the author may edit or delete, and a rejected write publishes nothing', async () => {
    const root = await m.svc.createRoot(alice, READING, 'mine')
    const { got, stop } = listen(READING)
    await expect(m.svc.editAnnotation(bob, root.id, 'hijack')).rejects.toMatchObject({
      status: 403,
    })
    await expect(m.svc.deleteAnnotation(bob, root.id)).rejects.toMatchObject({ status: 403 })
    expect(got).toEqual([])
    expect((await m.svc.listAnnotations(READING))[0].body).toBe('mine')
    stop()
  })

  it('replies are one level deep, and only to annotations that exist', async () => {
    const root = await m.svc.createRoot(alice, READING, 'root')
    const reply = await m.svc.createReply(bob, root.id, 'reply')
    await expect(m.svc.createReply(alice, reply.id, 'reply to a reply')).rejects.toMatchObject({
      status: 400,
    })
    await m.svc.deleteAnnotation(alice, root.id)
    await expect(m.svc.createReply(bob, root.id, 'anyone there?')).rejects.toMatchObject({
      status: 404,
    })
  })

  it("can't annotate a reading that doesn't exist", async () => {
    await expect(m.svc.createRoot(alice, 'no-such-reading', 'hello')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('lists a reading’s annotations newest first', async () => {
    const first = await m.svc.createRoot(alice, READING, 'first')
    await new Promise((r) => setTimeout(r, 5)) // distinct createdAt
    const second = await m.svc.createRoot(bob, READING, 'second')
    expect((await m.svc.listAnnotations(READING)).map((a) => a.id)).toEqual([second.id, first.id])
  })

  it('rejects empty or whitespace-only annotations and trims the rest', async () => {
    const { bodySchema } = await import('./schemas')
    expect(bodySchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(bodySchema.safeParse({ body: '  ok ' }).data).toEqual({ body: 'ok' })
  })
})
