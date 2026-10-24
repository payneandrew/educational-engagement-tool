import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AnnotationEvent } from './events'

// Real (throwaway) MongoDB. Imports are dynamic so MONGO_URI is set before db.ts reads it.
let mongod: MongoMemoryServer
let m: { db: typeof import('./db'); svc: typeof import('./services/annotations'); events: typeof import('./events') }

const DOC = 'civil-disobedience'
const OTHER_DOC = 'on-liberty-ch2'
const alice = { _id: 'u-alice', name: 'Alice Chen', role: 'student' } as const
const bob = { _id: 'u-bob', name: 'Bob Okafor', role: 'student' } as const

/** Collects the events published for one reading. */
function listen(documentId: string) {
  const got: AnnotationEvent[] = []
  const stop = m.events.subscribe(documentId, e => got.push(e))
  return { got, stop }
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  process.env.MONGO_URI = mongod.getUri()
  m = { db: await import('./db'), svc: await import('./services/annotations'), events: await import('./events') }
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
    const here = listen(DOC)
    const elsewhere = listen(OTHER_DOC)
    const created = await m.svc.createRoot(alice, DOC, 'only for this reading')
    expect(here.got).toEqual([{ type: 'annotation', annotation: created }])
    expect(elsewhere.got).toEqual([])
    here.stop(); elsewhere.stop()
  })

  it('publishes edits, marked as edited', async () => {
    const root = await m.svc.createRoot(alice, DOC, 'original wording')
    const { got, stop } = listen(DOC)
    await m.svc.editAnnotation(alice, root.id, 'revised wording')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({ type: 'annotation', annotation: { id: root.id, body: 'revised wording' } })
    expect(got[0].type === 'annotation' && got[0].annotation.editedAt).toBeTruthy()
    stop()
  })

  it('stops delivering after unsubscribe', async () => {
    const { got, stop } = listen(DOC)
    stop()
    await m.svc.createRoot(alice, DOC, 'nobody is listening')
    expect(got).toEqual([])
    expect(m.events.subscriberCount()).toBe(0)
  })
})

describe('delete', () => {
  it('deleting a top-level annotation also deletes its replies, and says so', async () => {
    const root = await m.svc.createRoot(alice, DOC, 'opening comment')
    const reply = await m.svc.createReply(bob, root.id, 'a reply')
    const { got, stop } = listen(DOC)

    const { ids } = await m.svc.deleteAnnotation(alice, root.id)

    expect(ids.sort()).toEqual([root.id, reply.id].sort())
    expect(got).toEqual([{ type: 'deleted', ids }])
    expect(await m.svc.listAnnotations(DOC)).toEqual([])
    stop()
  })

  it('deleting a reply leaves the thread alone', async () => {
    const root = await m.svc.createRoot(alice, DOC, 'opening comment')
    const reply = await m.svc.createReply(bob, root.id, 'a reply')
    await m.svc.deleteAnnotation(bob, reply.id)
    expect((await m.svc.listAnnotations(DOC)).map(a => a.id)).toEqual([root.id])
  })
})

describe('rules', () => {
  it('only the author may edit or delete, and a rejected write publishes nothing', async () => {
    const root = await m.svc.createRoot(alice, DOC, 'mine')
    const { got, stop } = listen(DOC)
    await expect(m.svc.editAnnotation(bob, root.id, 'hijack')).rejects.toMatchObject({ status: 403 })
    await expect(m.svc.deleteAnnotation(bob, root.id)).rejects.toMatchObject({ status: 403 })
    expect(got).toEqual([])
    expect((await m.svc.listAnnotations(DOC))[0].body).toBe('mine')
    stop()
  })

  it('replies are one level deep, and only to annotations that exist', async () => {
    const root = await m.svc.createRoot(alice, DOC, 'root')
    const reply = await m.svc.createReply(bob, root.id, 'reply')
    await expect(m.svc.createReply(alice, reply.id, 'reply to a reply')).rejects.toMatchObject({ status: 400 })
    await m.svc.deleteAnnotation(alice, root.id)
    await expect(m.svc.createReply(bob, root.id, 'anyone there?')).rejects.toMatchObject({ status: 404 })
  })

  it("can't annotate a reading that doesn't exist", async () => {
    await expect(m.svc.createRoot(alice, 'no-such-reading', 'hello')).rejects.toMatchObject({ status: 404 })
  })

  it('lists a reading’s annotations newest first', async () => {
    const first = await m.svc.createRoot(alice, DOC, 'first')
    await new Promise(r => setTimeout(r, 5)) // distinct createdAt
    const second = await m.svc.createRoot(bob, DOC, 'second')
    expect((await m.svc.listAnnotations(DOC)).map(a => a.id)).toEqual([second.id, first.id])
  })

  it('rejects empty or whitespace-only annotations and trims the rest', async () => {
    const { bodySchema } = await import('./schemas')
    expect(bodySchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(bodySchema.safeParse({ body: '  ok ' }).data).toEqual({ body: 'ok' })
  })
})
