/**
 * A new post's id, made in the browser so a retry can reuse it. Same format as the server's ids
 * (24 hex characters) from 96 random bits.
 */
export const newId = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')

/**
 * Retries a request that got no answer at all (fetch rejects with a TypeError): three tries, waiting
 * 1s then 2s. Only for requests the server treats as repeats, like posts with a client-made id.
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
