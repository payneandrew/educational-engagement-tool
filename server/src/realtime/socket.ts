import type { Server as HttpServer } from 'node:http'
import { Server, type Socket } from 'socket.io'
import { readings, users } from '../db'
import { subscriptionSchema } from '../schemas'
import { onEvent } from './events'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  SubscribeResult,
} from './protocol'
import type { Viewer } from './schema'

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>
type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>

const roomOf = (readingId: string) => `reading:${readingId}`
const readingIdOfRoom = (room: string) =>
  room.startsWith('reading:') ? room.slice('reading:'.length) : null

/**
 * Live updates over Socket.IO, on the same HTTP server as the REST API.
 *
 * - One socket per browser tab. The client subscribes to the readings it shows; each is a room.
 * - Writes stay on REST (validated, typed through Hono RPC). Fan-out comes from the domain events
 *   the services publish (events.ts), emitted to that reading's room.
 * - Connection state recovery: each room broadcast carries an offset, and a client that drops for
 *   less than two minutes gets its rooms back and the events it missed replayed. After a longer gap
 *   (`socket.recovered` false) the client reloads the list over REST instead.
 *
 * Single process: the default in-memory adapter keeps rooms and the replay buffer in this process.
 * To run several API servers, add an adapter that shares both (Redis Streams supports recovery);
 * nothing else changes.
 */
export function attachSocketServer(httpServer: HttpServer): { io: IO; close: () => Promise<void> } {
  const io: IO = new Server(httpServer, {
    // WebSocket only, no long-polling fallback: no sticky sessions needed behind a load balancer.
    transports: ['websocket'],
    serveClient: false,
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60_000, skipMiddlewares: true },
  })

  // No real auth (as the exercise allows): the handshake names a user, and the server looks it up.
  io.use((socket, next) => {
    const { userId } = socket.handshake.auth as { userId?: unknown }
    if (typeof userId !== 'string') return next(new Error('unknown user'))
    users
      .findOne({ _id: userId })
      .then((user) => {
        if (!user) return next(new Error('unknown user'))
        socket.data.user = user
        next()
      })
      .catch(() => next(new Error('server error')))
  })

  const stopListening = onEvent((readingId, event) =>
    io.to(roomOf(readingId)).emit('reading:event', readingId, event),
  )

  /** Presence is the room's membership: no separate bookkeeping, and it works across servers with an adapter. */
  async function broadcastViewers(readingId: string) {
    const sockets = await io.in(roomOf(readingId)).fetchSockets()
    const viewers = new Map<string, Viewer>()
    for (const { data } of sockets)
      if (!viewers.has(data.user._id))
        viewers.set(data.user._id, { id: data.user._id, name: data.user.name })
    io.to(roomOf(readingId)).emit('reading:event', readingId, {
      type: 'viewers',
      viewers: [...viewers.values()],
    })
  }

  async function subscribe(socket: AppSocket, raw: unknown): Promise<SubscribeResult> {
    const parsed = subscriptionSchema.safeParse(raw)
    if (!parsed.success) return { ok: false, error: 'invalid subscription' }
    const { readingId } = parsed.data
    if (!(await readings.countDocuments({ _id: readingId }, { limit: 1 })))
      return { ok: false, error: 'reading not found' }
    await socket.join(roomOf(readingId))
    await broadcastViewers(readingId)
    return { ok: true }
  }

  async function unsubscribe(socket: AppSocket, raw: unknown) {
    const parsed = subscriptionSchema.safeParse(raw)
    if (!parsed.success) return
    await socket.leave(roomOf(parsed.data.readingId))
    await broadcastViewers(parsed.data.readingId)
  }

  // Handlers are async but Socket.IO ignores their promises, so every one reports its own failure:
  // an unhandled rejection would crash the server.
  const report = (error: unknown) => console.error('[socket]', error)

  io.on('connection', (socket) => {
    // A recovered socket is back in its rooms without subscribing again; refresh who's here.
    if (socket.recovered)
      for (const room of socket.rooms) {
        const readingId = readingIdOfRoom(room)
        if (readingId) broadcastViewers(readingId).catch(report)
      }

    socket.on('subscribe', (subscription, ack) => {
      subscribe(socket, subscription)
        .catch((error: unknown) => {
          report(error)
          return { ok: false, error: 'server error' } as const
        })
        .then((result) => {
          if (typeof ack === 'function') ack(result) // clients are untrusted; one might not send an ack
        })
        .catch(report)
    })
    socket.on('unsubscribe', (subscription) => {
      unsubscribe(socket, subscription).catch(report)
    })
    // Rooms are emptied on disconnect, so note them while they're still there.
    socket.on('disconnecting', () => {
      const readingIds = [...socket.rooms].map(readingIdOfRoom).filter((id) => id !== null)
      socket.once('disconnect', () => {
        for (const readingId of readingIds) broadcastViewers(readingId).catch(report)
      })
    })
  })

  return {
    io,
    /** Also closes the HTTP server it is attached to. */
    close: async () => {
      stopListening()
      await io.close()
    },
  }
}
