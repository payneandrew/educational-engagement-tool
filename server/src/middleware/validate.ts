import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { z } from 'zod'

/**
 * zValidator, failing with the same `{ error: string }` body as every other API error, so the
 * client can show the message ("annotation cannot be empty") instead of a generic one.
 */
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success)
      return c.json(
        {
          error: result.error.issues
            .map((issue) => `${issue.path.join('.') || target}: ${issue.message}`)
            .join('; '),
        },
        400,
      )
  })
