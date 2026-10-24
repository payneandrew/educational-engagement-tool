/**
 * Turning API responses and failures into data or user-facing messages. Kept apart from api.ts
 * (which builds the client from `location`) so it has no browser dependencies and is easy to test.
 */

/** Drops the typed `{ error }` failure variants, leaving the success shape. */
type Ok<T> = Exclude<T, { error: string }>

/** Unwraps a Response: its body on 2xx, otherwise throws an Error with a message fit to show. */
export async function unwrap<R extends { ok: boolean; status: number; json(): Promise<unknown> }>(
  res: R,
): Promise<Ok<Awaited<ReturnType<R['json']>>>> {
  if (!res.ok) throw new Error(await errorMessage(res))
  // On success the body is whatever the route returned; R['json'] carries that type from the server.
  return (await res.json()) as Ok<Awaited<ReturnType<R['json']>>>
}

/**
 * The API's `{ error }` message when there is one. A proxy or crash can answer with an empty or
 * non-JSON body instead (Vite's dev proxy sends an empty 502 while the API restarts).
 */
async function errorMessage(res: { status: number; json(): Promise<unknown> }) {
  const body = await res.json().catch(() => undefined)
  if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string')
    return body.error
  return res.status >= 500
    ? 'The server is unavailable right now. Please try again in a moment.'
    : `Request failed (HTTP ${res.status}).`
}

/** A message to show the user for anything an API call can throw. */
export function messageOf(e: unknown) {
  // fetch() rejects with a TypeError when the server can't be reached at all.
  if (e instanceof TypeError)
    return "Couldn't reach the server. Check your connection and try again."
  return e instanceof Error ? e.message : String(e)
}
