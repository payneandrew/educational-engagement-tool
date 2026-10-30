import { EventEmitter } from 'node:events'
import type { ReadingEvent } from './schema'

export type { AnnotationEvent, ReadingEvent, Viewer } from './schema'

/**
 * Domain events, kept apart from any transport: the services publish here and don't know about
 * sockets; realtime/socket.ts is the one listener that fans them out to browsers. That keeps the
 * services testable without a socket server, and the transport swappable.
 */
const bus = new EventEmitter()

export const publish = (readingId: string, event: ReadingEvent): void =>
  void bus.emit('event', readingId, event)

/** Returns the function that stops listening. */
export function onEvent(listener: (readingId: string, event: ReadingEvent) => void): () => void {
  bus.on('event', listener)
  return () => void bus.off('event', listener)
}
