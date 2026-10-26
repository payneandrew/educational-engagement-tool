import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppEnv } from '../middleware/auth'
import { joinReading, subscribe } from './events'

/** How often the live stream sends a keep-alive comment. Overridable so tests needn't wait. */
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 25_000)

/**
 * Live updates for one reading. The client reloads the full list whenever this (re)connects, so the
 * stream only carries what happens while it's open.
 */
export const streamReading = (c: Context<AppEnv, '/:id/stream'>) =>
  streamSSE(c, async (stream) => {
    const readingId = c.req.param('id')
    // Write something right away: proxies (including Vite's dev proxy) hold the response headers
    // until the first body bytes, and the client only loads the list once the stream has opened.
    // `retry` also tells the browser to wait 3s between reconnect attempts.
    await stream.write('retry: 3000\n\n')
    // Each message's data is one ReadingEvent (events.ts); the client imports that type.
    const unsubscribe = subscribe(readingId, (event) => {
      // A write racing a disconnect rejects; the stream is closing anyway, so drop it.
      stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {})
    })
    // After subscribing, so this stream also gets the viewer list its own arrival triggers.
    const leave = joinReading(readingId, c.get('user'))
    // Proxies and load balancers close connections that stay idle for about a minute. A comment line
    // (": …", which EventSource ignores) every HEARTBEAT_MS keeps a quiet stream open.
    const heartbeat = setInterval(() => {
      stream.write(': ping\n\n').catch(() => {})
    }, HEARTBEAT_MS)
    // Hold the response open until the browser disconnects.
    await new Promise<void>((resolve) => stream.onAbort(resolve))
    clearInterval(heartbeat)
    unsubscribe()
    leave()
  })
