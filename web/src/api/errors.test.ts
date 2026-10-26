import { describe, expect, it } from 'vitest'
import { messageOf, unwrap } from './errors'

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

describe('unwrap', () => {
  it('returns the body of a successful response', async () => {
    expect(await unwrap(json(200, { id: 'r1' }))).toEqual({ id: 'r1' })
  })

  it("throws the API's own error message", async () => {
    await expect(
      unwrap(json(403, { error: 'only students can post annotations' })),
    ).rejects.toThrow('only students can post annotations')
  })

  it('explains an empty or non-JSON error body instead of a JSON parse error', async () => {
    // What Vite's dev proxy sends while the API is restarting.
    await expect(unwrap(new Response('', { status: 502 }))).rejects.toThrow(
      'The server is unavailable right now. Please try again in a moment.',
    )
    await expect(unwrap(new Response('<html>Not found</html>', { status: 404 }))).rejects.toThrow(
      'Request failed (HTTP 404).',
    )
  })
})

describe('messageOf', () => {
  it('explains a network failure (fetch rejects with a TypeError)', () => {
    expect(messageOf(new TypeError('Failed to fetch'))).toBe(
      "Couldn't reach the server. Check your connection and try again.",
    )
  })

  it('uses an Error’s message, and copes with anything else being thrown', () => {
    expect(messageOf(new Error('reading not found'))).toBe('reading not found')
    expect(messageOf('plain string')).toBe('plain string')
  })
})
