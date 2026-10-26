import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { z } from 'zod'

/**
 * zValidator with a uniform failure body. Without the hook, the 400 response type is zod's raw
 * SafeParseError, which would leak into every client call's response union.
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
