import { describe, expect, it, vi } from 'vitest'
import { boundedSender } from './bounded-sender'

describe('boundedSender', () => {
  it('runs writes one at a time, in call order', async () => {
    const order: number[] = []
    const s = boundedSender({ max: 10, onOverflow: () => {} })
    // The first write is slower; if writes overlapped, 2 and 3 would finish first.
    s.send(() => new Promise(r => setTimeout(() => (order.push(1), r(null)), 30)))
    s.send(async () => void order.push(2))
    s.send(async () => void order.push(3))
    await vi.waitFor(() => expect(order).toEqual([1, 2, 3]))
    expect(s.pending).toBe(0)
  })

  it('cuts off a client whose writes never complete, instead of queueing forever', () => {
    const onOverflow = vi.fn()
    const s = boundedSender({ max: 3, onOverflow })
    const stalled = () => new Promise(() => {}) // a write to a client that stopped reading
    for (let i = 0; i < 100; i++) s.send(stalled)
    expect(s.pending).toBe(3) // memory bounded: nothing past `max` was queued
    expect(onOverflow).toHaveBeenCalledTimes(1) // and we only give up once
    expect(s.overflowed).toBe(true)
  })

  it('does not trip for a healthy client, however many events it gets over time', async () => {
    const onOverflow = vi.fn()
    const s = boundedSender({ max: 3, onOverflow })
    for (let i = 0; i < 50; i++) {
      s.send(async () => {})
      await new Promise(r => setImmediate(r)) // drains between sends
    }
    expect(onOverflow).not.toHaveBeenCalled()
  })

  it('survives a failing write without stalling the queue', async () => {
    const done = vi.fn()
    const s = boundedSender({ max: 5, onOverflow: () => {} })
    s.send(() => Promise.reject(new Error('socket closed')))
    s.send(async () => done())
    await vi.waitFor(() => expect(done).toHaveBeenCalled())
  })
})
