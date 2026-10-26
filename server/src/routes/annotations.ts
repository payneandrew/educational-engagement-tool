import { Hono } from 'hono'
import { requireStudent, type AppEnv } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { updateAnnotationSchema, createAnnotationSchema } from '../schemas'
import { createReply, deleteAnnotation, updateAnnotation } from '../services/annotations'

/** `/annotations/:id`: replying to, editing and deleting an existing annotation. Students only. */
export const annotationsRoutes = new Hono<AppEnv>()
  .post('/:id/replies', requireStudent, validate('json', createAnnotationSchema), async (c) => {
    const { body, id } = c.req.valid('json')
    return c.json(await createReply(c.get('user'), c.req.param('id'), body, id), 201)
  })

  .patch('/:id', requireStudent, validate('json', updateAnnotationSchema), async (c) =>
    c.json(await updateAnnotation(c.get('user'), c.req.param('id'), c.req.valid('json').body)),
  )

  .delete('/:id', requireStudent, async (c) =>
    c.json(await deleteAnnotation(c.get('user'), c.req.param('id'))),
  )
