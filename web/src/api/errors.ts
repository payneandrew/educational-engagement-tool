import { DetailedError } from 'hono/client'

/**
 * A message to show the user for anything an API call can throw. `parseResponse` (from Hono's
 * client) throws a DetailedError for a non-2xx response; our server puts a readable message in its
 * `{ error }` body, which ends up in `detail.data`.
 */
export function messageOf(error: unknown) {
  if (error instanceof DetailedError) {
    const body: unknown = error.detail?.data
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string')
      return body.error
    // No message from our API: a proxy or crash answered (Vite's dev proxy sends an empty 502).
    if (Number(error.statusCode) >= 500)
      return 'The server is unavailable right now. Please try again in a moment.'
  }
  // fetch() rejects with a TypeError when the server can't be reached at all.
  if (error instanceof TypeError)
    return "Couldn't reach the server. Check your connection and try again."
  return 'Something went wrong. Please try again.'
}
