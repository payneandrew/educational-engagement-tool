import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import { users } from '../db'
import type { UserDoc } from '../db/models'

/** Hono env for every authenticated route: `auth` puts the caller's user record in `c.var.user`. */
export type AppEnv = { Variables: { user: UserDoc } }

/** No real auth: the caller names a seeded user, and the server looks up their role from its own records. */
export const auth = createMiddleware<AppEnv>(async (c, next) => {
  // EventSource can't send headers, so the stream route also accepts ?uid=.
  const uid = c.req.header('x-user-id') ?? c.req.query('uid')
  const user = uid ? await users.findOne({ _id: uid }) : null
  if (!user) throw new HTTPException(401, { message: 'unknown user' })
  c.set('user', user)
  await next()
})

// Anyone can read. Only instructors create readings, and only students write annotations.
export const instructorOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'instructor')
    throw new HTTPException(403, { message: 'only instructors can do this' })
  await next()
})

export const studentOnly = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'student')
    throw new HTTPException(403, { message: 'only students can post annotations' })
  await next()
})
