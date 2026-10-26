import { Hono } from 'hono'
import { studentOnly, type AppEnv } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { bodySchema } from '../schemas'
import { createReply, deleteAnnotation, editAnnotation } from '../services/annotations'

/** `/annotations/:id`: replying to, editing and deleting an existing annotation. Students only. */
export const annotationsRoutes = new Hono<AppEnv>()
  .post('/:id/replies', studentOnly, validate('json', bodySchema), async (c) =>
    c.json(await createReply(c.get('user'), c.req.param('id'), c.req.valid('json').body), 201),
  )

  .patch('/:id', studentOnly, validate('json', bodySchema), async (c) =>
    c.json(await editAnnotation(c.get('user'), c.req.param('id'), c.req.valid('json').body)),
  )

  .delete('/:id', studentOnly, async (c) =>
    c.json(await deleteAnnotation(c.get('user'), c.req.param('id'))),
  )
