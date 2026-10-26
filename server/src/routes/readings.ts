import { Hono } from 'hono'
import { requireInstructor, requireStudent, type AppEnv } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { streamReading } from '../realtime/stream'
import { createAnnotationSchema, createReadingSchema } from '../schemas'
import { createRoot, listAnnotations } from '../services/annotations'
import { createReading, getReading, listReadings } from '../services/readings'

/** `/readings`, plus the annotations and live stream that belong to one reading. */
export const readingsRoutes = new Hono<AppEnv>()
  .get('/', async (c) => c.json(await listReadings()))

  .post('/', requireInstructor, validate('json', createReadingSchema), async (c) =>
    c.json(await createReading(c.get('user'), c.req.valid('json')), 201),
  )

  .get('/:id', async (c) => c.json(await getReading(c.req.param('id'))))

  .get('/:id/annotations', async (c) => c.json(await listAnnotations(c.req.param('id'))))

  // Returns the saved annotation (so the author's UI updates immediately); it's also pushed to
  // everyone viewing the reading over its SSE stream.
  .post('/:id/annotations', requireStudent, validate('json', createAnnotationSchema), async (c) => {
    const { body, id } = c.req.valid('json')
    return c.json(await createRoot(c.get('user'), c.req.param('id'), body, id), 201)
  })

  .get('/:id/stream', streamReading)
