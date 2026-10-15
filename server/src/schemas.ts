import { zValidator } from '@hono/zod-validator'
import type { ValidationTargets } from 'hono'
import { z } from 'zod'

/**
 * zValidator with a uniform failure body. Without the hook, the 400 response type is zod's raw
 * SafeParseError, which would leak into every client call's response union.
 */
export const validate = <T extends z.ZodType, Target extends keyof ValidationTargets>(target: Target, schema: T) =>
  zValidator(target, schema, (result, c) => {
    if (!result.success)
      return c.json({ error: result.error.issues.map(i => `${i.path.join('.') || target}: ${i.message}`).join('; ') }, 400)
  })

export const idParam = z.object({ id: z.string().min(1).max(64) })

export const anchorSchema = z
  .object({
    start: z.number().int().min(0),
    end: z.number().int().min(1),
    exact: z.string().min(1).max(2000),
    prefix: z.string().max(64),
    suffix: z.string().max(64),
  })
  .refine(a => a.end > a.start && a.end - a.start === a.exact.length, 'range must match quoted text length')

const body = z.string().trim().min(1).max(5000)

export const createAnnotationBody = z.object({ anchor: anchorSchema, body })
export const createReplyBody = z.object({ body })

export const streamQuery = z.object({
  // EventSource can't set headers on the FIRST connect, so the client passes its snapshot seq here.
  // On automatic reconnects the browser sends the Last-Event-ID header instead, which wins.
  lastEventId: z.coerce.number().int().min(0).optional(),
})

const pts = z.number().min(0).max(100)
export const scoringConfigSchema = z.object({
  commentPoints: pts,
  replyPoints: pts,
  upvoteReceivedPoints: pts,
  upvoteGivenPoints: pts,
  minChars: z.number().int().min(0).max(1000),
  maxUpvotesPerPost: z.number().int().min(0).max(1000),
})
