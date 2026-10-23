import { hc, type InferResponseType } from 'hono/client'
import type { AppType } from '../../server/src/app'
import { currentUserId } from './session'

/**
 * The entire API surface, typed from the server's route chain. There is nothing to keep in sync:
 * change a route or validator on the server and every call below re-checks at compile time.
 */
export const client = hc<AppType>(location.origin, { headers: () => ({ 'x-user-id': currentUserId.value }) })

/** Drops the typed `{ error }` failure variants, leaving the success shape. */
type Ok<T> = Exclude<T, { error: string }>

// Response types are *inferred* from the client, not declared.
export type Reading = Ok<InferResponseType<typeof client.api.readings.$get>>[number]
export type Annotation = Ok<InferResponseType<(typeof client.api.readings)[':id']['annotations']['$get']>>['annotations'][number]

/** Mutations the discussion UI can trigger. Each resolves true on success, so the caller knows to clear its draft. */
export interface FeedActions {
  create(body: string): Promise<boolean>
  reply(rootId: string, body: string): Promise<boolean>
  edit(id: string, body: string): Promise<boolean>
  remove(id: string): Promise<boolean>
}

/** Unwraps a Response, throwing the server's `{ error }` message on non-2xx. */
export async function unwrap<R extends { ok: boolean; status: number; json(): Promise<any> }>(
  res: R,
): Promise<Ok<Awaited<ReturnType<R['json']>>>> {
  const body = await res.json()
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`)
  return body
}
