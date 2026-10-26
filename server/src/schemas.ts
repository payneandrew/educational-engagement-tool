import { z } from 'zod'

export const readingSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200),
  description: z.string().trim().min(1, 'description is required').max(5000),
})

/** A live-updates subscription (realtime/protocol.ts). Socket payloads are untrusted, like request bodies. */
export const subscriptionSchema = z.object({
  type: z.literal('reading'),
  readingId: z.string().min(1).max(64),
})

/** Trimmed first, so whitespace-only annotations are rejected as empty. */
export const bodySchema = z.object({
  body: z.string().trim().min(1, 'annotation cannot be empty').max(5000),
})
