import { z } from 'zod'

export const createReadingSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200),
  description: z.string().trim().min(1, 'description is required').max(5000),
})

export type CreateReadingInput = z.infer<typeof createReadingSchema>

/** Trimmed first, so whitespace-only annotations are rejected as empty. */
export const updateAnnotationSchema = z.object({
  body: z.string().trim().min(1, 'annotation cannot be empty').max(5000),
})

/**
 * Creating a post: the client may choose its id (same format as server ids), so it can show the post
 * before the server answers and retry without creating a duplicate.
 */
export const createAnnotationSchema = updateAnnotationSchema.extend({
  id: z
    .string()
    .regex(/^[0-9a-f]{24}$/, 'id must be 24 hexadecimal characters')
    .optional(),
})
