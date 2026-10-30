import { parseResponse } from 'hono/client'
import { describe, expect, it } from 'vitest'
import { messageOf } from './errors'

/** What `parseResponse` throws for a failed response, exactly as the app meets it. */
async function failureFor(response: Response) {
  try {
    await parseResponse(Promise.resolve(response) as never)
  } catch (error) {
    return error
  }
  throw new Error('expected parseResponse to throw')
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

describe('messageOf', () => {
  it("shows the API's own error message", async () => {
    const error = await failureFor(json(403, { error: 'only students can post annotations' }))
    expect(messageOf(error)).toBe('only students can post annotations')
  })

  it("explains a failure the API didn't word itself", async () => {
    // What Vite's dev proxy sends while the API is restarting.
    expect(messageOf(await failureFor(new Response('', { status: 502 })))).toBe(
      'The server is unavailable right now. Please try again in a moment.',
    )
    expect(
      messageOf(await failureFor(new Response('<html>Not found</html>', { status: 404 }))),
    ).toBe('Something went wrong. Please try again.')
  })

  it('explains a network failure (fetch rejects with a TypeError)', () => {
    expect(messageOf(new TypeError('Failed to fetch'))).toBe(
      "Couldn't reach the server. Check your connection and try again.",
    )
  })

  it('never shows the user the raw text of an unexpected error', () => {
    expect(messageOf(new Error("Cannot read properties of undefined (reading 'id')"))).toBe(
      'Something went wrong. Please try again.',
    )
    expect(messageOf('a thrown string')).toBe('Something went wrong. Please try again.')
  })
})
