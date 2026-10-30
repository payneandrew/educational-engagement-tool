import { EventEmitter } from 'node:events'
import type { ReadingEvent } from './schema'

export type { AnnotationEvent, ReadingEvent, Viewer } from './schema'

/**
 * In-process pub/sub with one channel per reading. Single process only: scaling out would swap this
 * for Redis pub/sub or a MongoDB change stream.
 */
const bus = new EventEmitter()
bus.setMaxListeners(0) // one listener per open stream

export const publish = (readingId: string, event: ReadingEvent): void =>
  void bus.emit(readingId, event)

export function subscribe(readingId: string, listener: (event: ReadingEvent) => void): () => void {
  bus.on(readingId, listener)
  return () => void bus.off(readingId, listener)
}

/** readingId -> userId -> name and open stream count (one per tab). */
const viewers = new Map<string, Map<string, { name: string; streams: number }>>()

const publishViewers = (readingId: string): void =>
  publish(readingId, {
    type: 'viewers',
    viewers: [...(viewers.get(readingId) ?? [])].map(([id, { name }]) => ({ id, name })),
  })

/** Records a user opening a reading and broadcasts who's here. Returns the matching "left" function. */
export function joinReading(readingId: string, user: { _id: string; name: string }): () => void {
  const here = viewers.get(readingId) ?? new Map<string, { name: string; streams: number }>()
  viewers.set(readingId, here)
  const viewer = here.get(user._id) ?? { name: user.name, streams: 0 }
  viewer.streams++
  here.set(user._id, viewer)
  publishViewers(readingId)
  return () => {
    if (--viewer.streams === 0) here.delete(user._id)
    if (here.size === 0) viewers.delete(readingId)
    publishViewers(readingId)
  }
}
