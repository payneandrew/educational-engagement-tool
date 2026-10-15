/**
 * Serializes writes to ONE client and bounds how many may be outstanding.
 *
 * A write to a stalled client (dead mobile connection, suspended tab, a proxy that stopped
 * reading) never completes: TCP buffers fill and the stream's promise stays pending. Without a
 * limit, every event for that client piles up in this process's memory. Past `max` we give up
 * on the client (`onOverflow` tears the connection down). That loses nothing: the browser
 * reconnects with Last-Event-ID and the missed state is replayed from MongoDB, so a slow
 * consumer costs one bounded queue, not unbounded heap.
 */
export function boundedSender(opts: { max: number; onOverflow: () => void }) {
  let tail: Promise<unknown> = Promise.resolve()
  let pending = 0
  let overflowed = false

  return {
    /** `write` is deferred until all earlier writes finished, so output order == call order. */
    send(write: () => Promise<unknown>) {
      if (overflowed) return
      if (pending >= opts.max) {
        overflowed = true
        opts.onOverflow()
        return
      }
      pending++
      tail = tail
        .then(write)
        .catch(() => {}) // a failed write means the client is gone; abort handling cleans up
        .finally(() => pending--)
    },
    get pending() {
      return pending
    },
    get overflowed() {
      return overflowed
    },
  }
}
