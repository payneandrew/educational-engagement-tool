import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { AnnotationEvent } from '../realtime/events'

// Real (throwaway) MongoDB. Imports are dynamic so MONGO_URI is set before db.ts reads it.
let mongod: MongoMemoryServer
let modules: {
  db: typeof import('../db')
  service: typeof import('./annotations')
  events: typeof import('../realtime/events')
}

const READING = 'civil-disobedience'
const OTHER_READING = 'on-liberty-ch2'
const alice = { _id: 'u-alice', name: 'Alice Chen', role: 'student' } as const
const bob = { _id: 'u-bob', name: 'Bob Okafor', role: 'student' } as const

/** Collects the events published for one reading. */
function listen(readingId: string) {
  const got: AnnotationEvent[] = []
  const stop = modules.events.onAnnotationEvent((event) => {
    if (modules.events.readingIdOf(event) === readingId) got.push(event)
  })
  return { got, stop }
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  process.env.MONGO_URI = mongod.getUri()
  modules = {
    db: await import('../db'),
    service: await import('./annotations'),
    events: await import('../realtime/events'),
  }
  await modules.db.initDb()
  await (await import('../seed')).seed()
}, 120_000)

beforeEach(async () => {
  await modules.db.annotations.deleteMany({})
})

afterAll(async () => {
  await modules.db.mongo.close()
  await mongod.stop()
})

describe('live events', () => {
  it("publishes a new annotation to that reading's viewers only", async () => {
    const here = listen(READING)
    const elsewhere = listen(OTHER_READING)
    const created = await modules.service.createRoot(alice, READING, 'only for this reading')
    expect(here.got).toEqual([{ type: 'created', annotation: created }])
    expect(elsewhere.got).toEqual([])
    here.stop()
    elsewhere.stop()
  })

  it('publishes edits, marked as edited', async () => {
    const root = await modules.service.createRoot(alice, READING, 'original wording')
    const { got, stop } = listen(READING)
    await modules.service.editAnnotation(alice, root.id, 'revised wording')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({
      type: 'updated',
      annotation: { id: root.id, body: 'revised wording' },
    })
    expect(got[0].type === 'updated' && got[0].annotation.editedAt).toBeTruthy()
    stop()
  })

  it('stops delivering after unsubscribe', async () => {
    const { got, stop } = listen(READING)
    stop()
    await modules.service.createRoot(alice, READING, 'nobody is listening')
    expect(got).toEqual([])
  })
})

describe('delete', () => {
  it('deleting a top-level annotation also deletes its replies, and says so', async () => {
    const root = await modules.service.createRoot(alice, READING, 'opening comment')
    await modules.service.createReply(bob, root.id, 'a reply')
    const { got, stop } = listen(READING)

    await modules.service.deleteAnnotation(alice, root.id)

    expect(got).toEqual([{ type: 'deleted', id: root.id, readingId: READING }]) // one event; clients drop the replies
    expect(await modules.service.listAnnotations(READING)).toEqual([]) // the root and its reply
    stop()
  })

  it('deleting a reply leaves the thread alone', async () => {
    const root = await modules.service.createRoot(alice, READING, 'opening comment')
    const reply = await modules.service.createReply(bob, root.id, 'a reply')
    await modules.service.deleteAnnotation(bob, reply.id)
    expect(
      (await modules.service.listAnnotations(READING)).map((annotation) => annotation.id),
    ).toEqual([root.id])
  })
})

describe('rules', () => {
  it('only the author may edit or delete, and a rejected write publishes nothing', async () => {
    const root = await modules.service.createRoot(alice, READING, 'mine')
    const { got, stop } = listen(READING)
    await expect(modules.service.editAnnotation(bob, root.id, 'hijack')).rejects.toMatchObject({
      status: 403,
    })
    await expect(modules.service.deleteAnnotation(bob, root.id)).rejects.toMatchObject({
      status: 403,
    })
    expect(got).toEqual([])
    expect((await modules.service.listAnnotations(READING))[0].body).toBe('mine')
    stop()
  })

  it('replies are one level deep, and only to annotations that exist', async () => {
    const root = await modules.service.createRoot(alice, READING, 'root')
    const reply = await modules.service.createReply(bob, root.id, 'reply')
    await expect(
      modules.service.createReply(alice, reply.id, 'reply to a reply'),
    ).rejects.toMatchObject({
      status: 400,
    })
    await modules.service.deleteAnnotation(alice, root.id)
    await expect(modules.service.createReply(bob, root.id, 'anyone there?')).rejects.toMatchObject({
      status: 404,
    })
  })

  it("can't annotate a reading that doesn't exist", async () => {
    await expect(
      modules.service.createRoot(alice, 'no-such-reading', 'hello'),
    ).rejects.toMatchObject({
      status: 404,
    })
  })

  it('lists a reading’s annotations newest first', async () => {
    const first = await modules.service.createRoot(alice, READING, 'first')
    await new Promise((resolve) => setTimeout(resolve, 5)) // distinct createdAt
    const second = await modules.service.createRoot(bob, READING, 'second')
    expect(
      (await modules.service.listAnnotations(READING)).map((annotation) => annotation.id),
    ).toEqual([second.id, first.id])
  })

  it('rejects empty or whitespace-only annotations and trims the rest', async () => {
    const { bodySchema } = await import('../schemas')
    expect(bodySchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(bodySchema.safeParse({ body: '  ok ' }).data).toEqual({ body: 'ok' })
  })
})
