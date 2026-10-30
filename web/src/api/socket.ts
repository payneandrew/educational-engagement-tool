import { io, type Socket } from 'socket.io-client'
import { watch } from 'vue'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../../../server/src/realtime/protocol'
import { currentUserId } from './session'

/**
 * One Socket.IO connection per tab, shared by every page that needs live updates; pages subscribe to
 * what they show. Event names and payloads are typed from the server's protocol.ts.
 */
export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  // Same origin (Vite proxies /socket.io in dev). WebSocket only, like the server.
  transports: ['websocket'],
  autoConnect: false,
  // Called on every (re)connect, so the handshake always names the current user.
  auth: (send) => send({ userId: currentUserId.value }),
})

/** Opens the connection on first use (no-op while connected or already reconnecting). */
export function ensureConnected(): void {
  if (!socket.active) socket.connect()
}

// The server fixes a socket's user at the handshake, so switching user means a new connection.
// A deliberate disconnect is never "recovered", so the new user starts with fresh subscriptions.
watch(currentUserId, () => {
  if (socket.active) socket.disconnect().connect()
})
