/**
 * The Socket.IO contract, shared by server and client (the client imports these types, like it
 * imports AppType for REST). Socket.IO checks every emit and handler against these maps.
 */
import type { UserDoc } from '../db/models'
import type { ReadingEvent } from './schema'

/** What a client can ask to receive. One kind today; the `type` leaves room for course- or user-wide feeds. */
export interface Subscription {
  type: 'reading'
  readingId: string
}

export type SubscribeResult = { ok: true } | { ok: false; error: string }

export interface ServerToClientEvents {
  /** One message type for everything on a reading: annotation changes, and who has it open. */
  'reading:event': (readingId: string, event: ReadingEvent) => void
}

export interface ClientToServerEvents {
  subscribe: (subscription: Subscription, ack: (result: SubscribeResult) => void) => void
  unsubscribe: (subscription: Subscription) => void
}

/** Per-socket server state, set by the auth middleware. */
export interface SocketData {
  user: UserDoc
}
