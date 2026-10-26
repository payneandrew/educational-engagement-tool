/**
 * Safe retries for creating posts: the browser picks the new post's id before sending, and resends
 * with that same id if a request gets no answer. The server recognises a repeat and returns the post
 * it already saved, so a lost response can't turn into a duplicate.
 */

/**
 * A new post's id, made in the browser before it is sent, so a retry can reuse it. Same format as the
 * server's ids (24 hex characters), from the browser's cryptographic random source: 96 random bits,
 * so ids don't collide in practice and can't be guessed.
 */
export const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

/**
 * Retries a request that got no answer at all (fetch rejects with a TypeError), up to three tries,
 * waiting 1s and then 2s between them. An answer from the server, even an error, is never retried.
 * Only for requests the server recognises as repeats, like posts with a client-made id.
 */
export async function withRetry<T>(request: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await request()
    } catch (error) {
      if (!(error instanceof TypeError) || attempt === 3) throw error
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
    }
  }
}
