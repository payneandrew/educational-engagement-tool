import { beforeEach, describe, expect, it } from 'vitest'
import { annotations } from '../db'
import * as events from '../realtime/events'
import type { ReadingEvent } from '../realtime/events'
import { updateAnnotationSchema } from '../schemas'
import { useTestDatabase } from '../test/database'
import * as service from './annotations'

useTestDatabase()

const READING = 'civil-disobedience'
const OTHER_READING = 'on-liberty-ch2'
const alice = { _id: 'u-alice', name: 'Alice Chen', role: 'student' } as const
const bob = { _id: 'u-bob', name: 'Bob Okafor', role: 'student' } as const

/** Collects the events published for one reading. */
function listen(readingId: string) {
  const got: ReadingEvent[] = []
  const stop = events.subscribe(readingId, (event) => got.push(event))
  return { got, stop }
}

beforeEach(async () => {
  await annotations.deleteMany({})
})

describe('live events', () => {
  it("publishes a new annotation to that reading's viewers only", async () => {
    const here = listen(READING)
    const elsewhere = listen(OTHER_READING)
    const created = await service.createRoot(alice, READING, 'only for this reading')
    expect(here.got).toEqual([{ type: 'annotation', annotation: created }])
    expect(elsewhere.got).toEqual([])
    here.stop()
    elsewhere.stop()
  })

  it('treats saving the same words as no edit: not marked edited, nothing published', async () => {
    const root = await service.createRoot(alice, READING, 'unchanged')
    const { got, stop } = listen(READING)
    expect((await service.updateAnnotation(alice, root.id, 'unchanged')).editedAt).toBeNull()
    expect(got).toEqual([])
    stop()
  })

  it('publishes edits, marked as edited', async () => {
    const root = await service.createRoot(alice, READING, 'original wording')
    const { got, stop } = listen(READING)
    await service.updateAnnotation(alice, root.id, 'revised wording')
    expect(got).toHaveLength(1)
    expect(got[0]).toMatchObject({
      type: 'annotation',
      annotation: { id: root.id, body: 'revised wording', editedAt: expect.any(String) },
    })
    stop()
  })

  it('stops delivering after unsubscribe', async () => {
    const { got, stop } = listen(READING)
    stop()
    await service.createRoot(alice, READING, 'nobody is listening')
    expect(got).toEqual([])
  })
})

describe('delete', () => {
  it('deleting a top-level annotation also deletes its replies, and says so', async () => {
    const root = await service.createRoot(alice, READING, 'opening comment')
    await service.createReply(bob, root.id, 'a reply')
    const { got, stop } = listen(READING)

    await service.deleteAnnotation(alice, root.id)

    expect(got).toEqual([{ type: 'deleted', id: root.id }]) // one event; clients drop the replies
    expect(await service.listAnnotations(READING)).toEqual([]) // the root and its reply
    stop()
  })

  it('deleting a reply leaves the thread alone', async () => {
    const root = await service.createRoot(alice, READING, 'opening comment')
    const reply = await service.createReply(bob, root.id, 'a reply')
    await service.deleteAnnotation(bob, reply.id)
    expect((await service.listAnnotations(READING)).map((annotation) => annotation.id)).toEqual([
      root.id,
    ])
  })
})

describe('rules', () => {
  it('only the author may edit or delete, and a rejected write publishes nothing', async () => {
    const root = await service.createRoot(alice, READING, 'mine')
    const { got, stop } = listen(READING)
    await expect(service.updateAnnotation(bob, root.id, 'hijack')).rejects.toMatchObject({
      status: 403,
    })
    await expect(service.deleteAnnotation(bob, root.id)).rejects.toMatchObject({
      status: 403,
    })
    expect(got).toEqual([])
    expect(await service.listAnnotations(READING)).toMatchObject([{ body: 'mine' }])
    stop()
  })

  it('replies are one level deep, and only to annotations that exist', async () => {
    const root = await service.createRoot(alice, READING, 'root')
    const reply = await service.createReply(bob, root.id, 'reply')
    await expect(service.createReply(alice, reply.id, 'reply to a reply')).rejects.toMatchObject({
      status: 400,
    })
    await service.deleteAnnotation(alice, root.id)
    await expect(service.createReply(bob, root.id, 'anyone there?')).rejects.toMatchObject({
      status: 404,
    })
  })

  it("can't annotate a reading that doesn't exist", async () => {
    await expect(service.createRoot(alice, 'no-such-reading', 'hello')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('lists annotations newest first', async () => {
    const first = await service.createRoot(alice, READING, 'first')
    await new Promise((resolve) => setTimeout(resolve, 5)) // distinct createdAt
    const second = await service.createRoot(bob, READING, 'second')
    expect((await service.listAnnotations(READING)).map((annotation) => annotation.id)).toEqual([
      second.id,
      first.id,
    ])
  })

  it('rejects empty or whitespace-only annotations and trims the rest', async () => {
    expect(updateAnnotationSchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(updateAnnotationSchema.safeParse({ body: '  ok ' }).data).toEqual({ body: 'ok' })
  })
})

describe('client-chosen ids', () => {
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa'

  it('saves the post under the id the client chose', async () => {
    const created = await service.createRoot(alice, READING, 'shown before saving', id)
    expect(created.id).toBe(id)
  })

  it("makes retries safe: a retry whose first attempt was saved returns it, and doesn't post twice", async () => {
    const { got, stop } = listen(READING)
    const first = await service.createRoot(alice, READING, 'sent twice', id)
    const retry = await service.createRoot(alice, READING, 'sent twice', id)
    expect(retry).toEqual(first)
    expect(await service.listAnnotations(READING)).toHaveLength(1)
    expect(got).toHaveLength(1) // viewers heard about it once
    stop()
  })

  it('handles two identical requests arriving at once: one post, and both get it back', async () => {
    const { got, stop } = listen(READING)
    const [first, second] = await Promise.all([
      service.createRoot(alice, READING, 'double-sent', id),
      service.createRoot(alice, READING, 'double-sent', id),
    ])
    expect(second).toEqual(first)
    expect(await service.listAnnotations(READING)).toHaveLength(1)
    expect(got).toHaveLength(1)
    stop()
  })

  it('refuses any other use of a taken id, without revealing the post that has it', async () => {
    await service.createRoot(alice, READING, 'the original', id)
    const thread = await service.createRoot(bob, READING, 'a thread to reply in')
    const clashes = [
      () => service.createRoot(bob, READING, 'the original', id), // someone else
      () => service.createRoot(alice, READING, 'different words', id), // not the same post
      () => service.createRoot(alice, OTHER_READING, 'the original', id), // another reading
      () => service.createReply(alice, thread.id, 'the original', id), // under a parent
    ]
    for (const clash of clashes) await expect(clash()).rejects.toMatchObject({ status: 409 })
  })
})
