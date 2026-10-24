import { EventEmitter } from 'node:events'
import type { AnnotationDTO } from './services/annotations'

/** What viewers of a reading are told after a write. */
export type AnnotationEvent =
  { type: 'annotation'; annotation: AnnotationDTO } | { type: 'deleted'; ids: string[] }

/**
 * In-process pub/sub, one channel per reading (the event name is the readingId). The annotation
 * service publishes after each successful write; each open SSE stream subscribes to its reading.
 *
 * Single-process only: with several API servers, a write on one wouldn't reach viewers connected to
 * another. Scaling out would swap this for Redis pub/sub or a MongoDB change stream; nothing else changes.
 */
const bus = new EventEmitter()
bus.setMaxListeners(0) // one listener per open stream; the default cap of 10 would just print warnings

export const publish = (readingId: string, event: AnnotationEvent) =>
  void bus.emit(readingId, event)

/** Returns the unsubscribe function. */
export function subscribe(readingId: string, listener: (event: AnnotationEvent) => void) {
  bus.on(readingId, listener)
  return () => void bus.off(readingId, listener)
}
