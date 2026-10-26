import { DetailedError } from 'hono/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSchema } from '../../../server/src/schemas'
import { newId, withRetry } from './retry'

describe('newId', () => {
  it("makes ids the server accepts (its own validation rule, so the two can't drift apart)", () => {
    const id = newId()
    expect(id).toMatch(/^[0-9a-f]{24}$/)
    expect(createSchema.safeParse({ body: 'hello', id }).success).toBe(true)
  })

  it("doesn't repeat", () => {
    const ids = new Set(Array.from({ length: 10_000 }, newId))
    expect(ids.size).toBe(10_000)
  })
})

// What fetch() throws when a request gets no answer at all.
const noAnswer = () => new TypeError('Failed to fetch')

describe('withRetry', () => {
  beforeEach(() => vi.useFakeTimers()) // the waits between tries pass instantly
  afterEach(() => vi.useRealTimers())

  it('tries again when there was no answer, waiting 1s then 2s', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(noAnswer())
      .mockRejectedValueOnce(noAnswer())
      .mockResolvedValue('saved')
    const result = withRetry(request)

    await vi.advanceTimersByTimeAsync(999)
    expect(request).toHaveBeenCalledTimes(1) // still waiting before the second try
    await vi.advanceTimersByTimeAsync(1)
    expect(request).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(request).toHaveBeenCalledTimes(2) // the second wait is longer
    await vi.advanceTimersByTimeAsync(1)
    expect(request).toHaveBeenCalledTimes(3)
    expect(await result).toBe('saved')
  })

  it('gives up after three tries and passes the failure on', async () => {
    const request = vi.fn().mockRejectedValue(noAnswer())
    const outcome = withRetry(request).catch((error: unknown) => error)
    await vi.runAllTimersAsync()
    expect(await outcome).toBeInstanceOf(TypeError)
    expect(request).toHaveBeenCalledTimes(3)
  })

  it("never retries an answer from the server, even an error: it isn't a lost request", async () => {
    const serverSaidNo = new DetailedError('400 Bad Request', { statusCode: 400 })
    const request = vi.fn().mockRejectedValue(serverSaidNo)
    await expect(withRetry(request)).rejects.toBe(serverSaidNo)
    expect(request).toHaveBeenCalledTimes(1)
  })
})
