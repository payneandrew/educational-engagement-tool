import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import type { z } from 'zod'

/* eslint-disable @typescript-eslint/explicit-module-boundary-types -- Hono infers the return type per route */
/** zValidator that fails with the same `{ error: string }` body as every other API error. */
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
