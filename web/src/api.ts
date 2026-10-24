import { hc, type InferResponseType } from 'hono/client'
import type { AppType } from '../../server/src/app'
import { currentUserId } from './session'

export { messageOf, unwrap } from './errors'

/**
 * The entire API surface, typed from the server's route chain. There is nothing to keep in sync:
 * change a route or validator on the server and every call below re-checks at compile time.
 */
export const client = hc<AppType>(location.origin, {
  headers: () => ({ 'x-user-id': currentUserId.value }),
})

/** Drops the typed `{ error }` failure variants, leaving the success shape. */
type Ok<T> = Exclude<T, { error: string }>

// Response types are *inferred* from the client, not declared.
export type User = Ok<InferResponseType<typeof client.api.users.$get>>[number]
/** A reading as listed, with its activity counts. */
export type Reading = Ok<InferResponseType<typeof client.api.readings.$get>>[number]
export type ReadingDetail = Ok<InferResponseType<(typeof client.api.readings)[':id']['$get']>>
export type Annotation = Ok<
  InferResponseType<(typeof client.api.readings)[':id']['annotations']['$get']>
>[number]
