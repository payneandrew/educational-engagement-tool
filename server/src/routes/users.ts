import { Hono } from 'hono'
import { listUsers } from '../services/users'

/** Seeded identities for the user switcher (the stand-in for login). Public. */
export const usersRoutes = new Hono().get('/', async (c) => c.json(await listUsers()))
