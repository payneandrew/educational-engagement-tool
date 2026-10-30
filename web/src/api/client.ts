import { hc, type InferResponseType } from 'hono/client'
import type { AppType } from '../../../server/src/app'
import { currentUserId } from './session'

export { messageOf } from './errors'
// Hono's helper: the body of a 2xx response, typed from the route; throws for anything else.
export { parseResponse } from 'hono/client'

/**
 * The entire API surface, typed from the server's route chain. There is nothing to keep in sync:
 * change a route or validator on the server and every call below re-checks at compile time.
 */
export const client = hc<AppType>(location.origin, {
  headers: () => ({ 'x-user-id': currentUserId.value }),
})

// Response types are *inferred* from the client, not declared.
export type User = InferResponseType<typeof client.api.users.$get>[number]
/** A reading as listed, with its activity counts. */
export type Reading = InferResponseType<typeof client.api.readings.$get>[number]
export type ReadingDetail = InferResponseType<(typeof client.api.readings)[':id']['$get']>
/** The instructor dashboard: every student's annotation count per reading. */
export type Participation = InferResponseType<typeof client.api.participation.$get>
export type Annotation = InferResponseType<
  (typeof client.api.readings)[':id']['annotations']['$get']
>[number]
