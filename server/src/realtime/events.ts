import { EventEmitter } from 'node:events'
import type { AnnotationDTO } from '../services/annotations'

/** What happened to an annotation. The annotation service publishes one after each successful write. */
export type AnnotationEvent =
  | { type: 'created'; annotation: AnnotationDTO }
  | { type: 'updated'; annotation: AnnotationDTO }
  /** Deleting a top-level annotation deletes its replies too; clients drop them by `parentId`. */
  | { type: 'deleted'; id: string; readingId: string }

export const readingIdOf = (event: AnnotationEvent) =>
  event.type === 'deleted' ? event.readingId : event.annotation.readingId

/**
 * Domain events, kept apart from any transport: the services publish here and don't know about
 * sockets; realtime/socket.ts is the one listener that fans events out to browsers. That keeps the
 * services testable without a socket server, and the transport swappable.
 */
const bus = new EventEmitter()

export const publish = (event: AnnotationEvent) => void bus.emit('annotation', event)

/** Returns the function that stops listening. */
export function onAnnotationEvent(listener: (event: AnnotationEvent) => void) {
  bus.on('annotation', listener)
  return () => void bus.off('annotation', listener)
}
