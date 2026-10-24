import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import { z } from 'zod'

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
            .map((i) => `${i.path.join('.') || target}: ${i.message}`)
            .join('; '),
        },
        400,
      )
  })

export const idParam = z.object({ id: z.string().min(1).max(64) })

export const readingSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200),
  description: z.string().trim().min(1, 'description is required').max(5000),
})

/** Trimmed first, so whitespace-only annotations are rejected as empty. */
export const bodySchema = z.object({
  body: z.string().trim().min(1, 'annotation cannot be empty').max(5000),
})
