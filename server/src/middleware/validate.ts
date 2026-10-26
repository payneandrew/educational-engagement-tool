import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { z } from 'zod'

/**
 * zValidator, failing with the same `{ error: string }` body as every other API error, so the
 * client can show the message ("annotation cannot be empty") instead of a generic one.
 *
 * No return type on `validate` on purpose: it is zValidator's, generic over the env, path and validated
 * input/output, and Hono infers those per route. Writing it out would erase what the typed client reads
 * from it.
 */
/* eslint-disable @typescript-eslint/explicit-module-boundary-types -- see above */
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (result.success) return
    return c.json(
      {
        error: result.error.issues
          .map((issue) => `${issue.path.join('.') || target}: ${issue.message}`)
          .join('; '),
      },
      400,
    )
  })
/* eslint-enable @typescript-eslint/explicit-module-boundary-types */
