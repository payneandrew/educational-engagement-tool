import { Hono } from 'hono'
import { users } from '../db'

/** Seeded identities for the user switcher (the stand-in for login). Public. */
export const usersRoutes = new Hono().get('/', async (c) => {
  const list = await users.find().sort({ _id: 1 }).toArray()
  return c.json(list.map(({ _id, name, role }) => ({ id: _id, name, role })))
})
