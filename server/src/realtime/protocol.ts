/**
 * The Socket.IO contract, shared by server and client (the client imports these types, like it
 * imports AppType for REST). Socket.IO checks every emit and handler against these maps.
 */
import type { UserDoc } from '../db/models'
import type { AnnotationDTO } from '../services/annotations'

export interface Viewer {
  id: string
  name: string
}

/** What a client can ask to receive. One kind today; the `type` leaves room for course- or user-wide feeds. */
export interface Subscription {
  type: 'reading'
  readingId: string
}

export type SubscribeResult = { ok: true } | { ok: false; error: string }

export interface ServerToClientEvents {
  'annotation:created': (annotation: AnnotationDTO) => void
  'annotation:updated': (annotation: AnnotationDTO) => void
  'annotation:deleted': (deleted: { id: string; readingId: string }) => void
  /** Who has the reading open right now, each person once however many tabs they have. */
  'reading:viewers': (update: { readingId: string; viewers: Viewer[] }) => void
}

export interface ClientToServerEvents {
  subscribe: (subscription: Subscription, ack: (result: SubscribeResult) => void) => void
  unsubscribe: (subscription: Subscription) => void
}

/** Per-socket server state, set by the auth middleware. */
export interface SocketData {
  user: UserDoc
}
