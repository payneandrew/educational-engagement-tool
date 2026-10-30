import * as z from 'zod/mini'

// Zod schemas for the live stream. The server's types are inferred from them and the browser parses
// with them, so they can't drift. No Node imports, and `zod/mini` keeps the browser bundle small.

/** Wire shape for REST and Socket.IO. */
export const annotationSchema = z.object({
  id: z.string(),
  readingId: z.string(),
  kind: z.enum(['root', 'reply']),
  parentId: z.nullable(z.string()),
  authorId: z.string(),
  authorName: z.string(),
  body: z.string(),
  createdAt: z.string(),
  editedAt: z.nullable(z.string()),
})
export type AnnotationDTO = z.infer<typeof annotationSchema>

/** Someone who has a reading open right now. */
export const viewerSchema = z.object({ id: z.string(), name: z.string() })
export type Viewer = z.infer<typeof viewerSchema>

const annotationChanged = z.object({ type: z.literal('annotation'), annotation: annotationSchema })
const annotationDeleted = z.object({ type: z.literal('deleted'), id: z.string() })

/** What viewers of a reading are told after a write. */
export const annotationEventSchema = z.discriminatedUnion('type', [
  annotationChanged,
  annotationDeleted,
])
export type AnnotationEvent = z.infer<typeof annotationEventSchema>

/** Everything sent on a reading's live stream: annotation changes, and who currently has it open. */
export const readingEventSchema = z.discriminatedUnion('type', [
  annotationChanged,
  annotationDeleted,
  z.object({ type: z.literal('viewers'), viewers: z.array(viewerSchema) }),
])
export type ReadingEvent = z.infer<typeof readingEventSchema>

/** Checks a payload received from the socket; undefined if it isn't a valid event. */
export function parseReadingEvent(data: unknown): ReadingEvent | undefined {
  const result = z.safeParse(readingEventSchema, data)
  return result.success ? result.data : undefined
}
