import { EventEmitter } from 'node:events'
import type { AnnotationDTO } from './services/annotations'

/** What viewers of a reading are told after a write. */
export type AnnotationEvent = { type: 'annotation'; annotation: AnnotationDTO } | { type: 'deleted'; ids: string[] }

/**
 * In-process pub/sub, one channel per reading (the event name is the documentId). The annotation
 * service publishes after each successful write; each open SSE stream subscribes to its reading.
 *
 * Single-process only: with several API servers, a write on one wouldn't reach viewers connected to
 * another. Scaling out would swap this for Redis pub/sub or a MongoDB change stream; nothing else changes.
 */
const bus = new EventEmitter()
bus.setMaxListeners(0) // one listener per open stream; the default cap of 10 would just print warnings

export const publish = (documentId: string, event: AnnotationEvent) => void bus.emit(documentId, event)

/** Returns the unsubscribe function. */
export function subscribe(documentId: string, listener: (event: AnnotationEvent) => void) {
  bus.on(documentId, listener)
  return () => void bus.off(documentId, listener)
}

export const subscriberCount = () => bus.eventNames().reduce((n, name) => n + bus.listenerCount(name), 0)
