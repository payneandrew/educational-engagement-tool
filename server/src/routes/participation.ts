import { Hono } from 'hono'
import { requireInstructor, type AppEnv } from '../middleware/auth'
import { getParticipation } from '../services/participation'

/** The instructor's dashboard: every student's annotation count on every reading. */
export const participationRoutes = new Hono<AppEnv>().get('/', requireInstructor, async (c) =>
  c.json(await getParticipation()),
)
