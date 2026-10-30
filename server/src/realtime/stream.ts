import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppEnv } from '../middleware/auth'
import { joinReading, subscribe } from './events'

/** Live updates for one reading. Clients reload the list on (re)connect, so this only carries new events. */
export const streamReading = (c: Context<AppEnv, '/:id/stream'>): Response =>
  streamSSE(c, async (stream) => {
    const readingId = c.req.param('id')
    // Write right away: proxies hold response headers until the first body bytes. Also sets the
    // browser's reconnect delay.
    await stream.write('retry: 3000\n\n')
    const unsubscribe = subscribe(readingId, (event) => {
      // A write racing a disconnect rejects; the stream is closing anyway.
      stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {})
    })
    // After subscribing, so this stream also receives the viewer list its own arrival triggers.
    const leave = joinReading(readingId, c.get('user'))
    // No heartbeat: localhost only (see README tradeoffs).
    await new Promise<void>((resolve) => stream.onAbort(resolve))
    unsubscribe()
    leave()
  })
