import { EventEmitter } from 'node:events'
import type { AnnotationDTO } from '../services/annotations'

/** What viewers of a reading are told after a write. */
export type AnnotationEvent =
  { type: 'annotation'; annotation: AnnotationDTO } | { type: 'deleted'; id: string }

/** Everything sent on a reading's live stream: annotation changes, and who currently has it open. */
export type ReadingEvent =
  AnnotationEvent | { type: 'viewers'; viewers: { id: string; name: string }[] }

/**
 * In-process pub/sub, one channel per reading (the event name is the readingId). The annotation
 * service publishes after each successful write; each open SSE stream subscribes to its reading.
 *
 * Single-process only: with several API servers, a write on one wouldn't reach viewers connected to
 * another. Scaling out would swap this for Redis pub/sub or a MongoDB change stream; nothing else changes.
 */
const bus = new EventEmitter()
bus.setMaxListeners(0) // one listener per open stream; the default cap of 10 would just print warnings

export const publish = (readingId: string, event: ReadingEvent) => void bus.emit(readingId, event)

/** Returns the unsubscribe function. */
export function subscribe(readingId: string, listener: (event: ReadingEvent) => void) {
  bus.on(readingId, listener)
  return () => void bus.off(readingId, listener)
}

/** Who has each reading open: readingId → userId → their name and how many streams (tabs) they have. */
const viewers = new Map<string, Map<string, { name: string; streams: number }>>()

const publishViewers = (readingId: string) =>
  publish(readingId, {
    type: 'viewers',
    viewers: [...(viewers.get(readingId) ?? [])].map(([id, { name }]) => ({ id, name })),
  })

/**
 * Records a user opening a reading and tells everyone on it (including them) who's here now. Returns
 * the matching "left" function. Someone with the reading open in two tabs counts once.
 */
export function joinReading(readingId: string, user: { _id: string; name: string }) {
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
