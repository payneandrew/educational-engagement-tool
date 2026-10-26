import { Hono } from 'hono'
import { instructorOnly, type AppEnv } from '../middleware/auth'
import { participation } from '../services/participation'

/** The instructor's dashboard: every student's annotation count on every reading. */
export const participationRoutes = new Hono<AppEnv>().get('/', instructorOnly, async (c) =>
  c.json(await participation()),
)
