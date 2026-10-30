import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { authenticate } from './middleware/auth'
import { annotationsRoutes } from './routes/annotations'
import { participationRoutes } from './routes/participation'
import { readingsRoutes } from './routes/readings'
import { usersRoutes } from './routes/users'

/**
 * The API. Routers live in routes/, one per resource; this file wires them together.
 *
 * Mounting with ONE chained expression is what makes Hono RPC work: each `.route()` returns a type
 * that accumulates the router's paths, validated inputs and JSON outputs, so `typeof app` is the
 * whole API contract. The Vue app imports `AppType` and gets a typed client from `hc<AppType>`, no
 * codegen, no hand-written types. (Splitting this into separate `app.route(...)` statements, or the
 * routers into `router.get(...)` statements, would discard that accumulation.)
 */
export const app = new Hono()
  .basePath('/api')
  .onError((error, c) => {
    if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
    console.error(error)
    return c.json({ error: 'Something went wrong on the server. Please try again.' }, 500)
  })
  // Everything except the user list needs to know who is calling. Role checks are per route.
  .use('/readings/*', authenticate)
  .use('/annotations/*', authenticate)
  .use('/participation/*', authenticate)
  .route('/users', usersRoutes)
  .route('/readings', readingsRoutes)
  .route('/annotations', annotationsRoutes)
  .route('/participation', participationRoutes)

export type AppType = typeof app
