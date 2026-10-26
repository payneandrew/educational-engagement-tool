import * as z from 'zod/mini'

/**
 * The shapes on a reading's live stream, as zod schemas: the server's types come from them (`z.infer`)
 * and the browser parses with them, so what is sent and what is trusted on arrival can't drift apart.
 * Kept free of Node imports (unlike events.ts) so the Vue app can import it at runtime, and written with
 * `zod/mini` so that import adds little to the browser bundle (full zod is ~25 kB gzipped more).
 */

/** Wire shape for REST and SSE. Inferred types flow from here to the Vue app via Hono RPC. */
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

/** One SSE message's data → the event it carries, or undefined if it isn't one. Never throws. */
export function parseReadingEvent(data: string): ReadingEvent | undefined {
  try {
    const result = z.safeParse(readingEventSchema, JSON.parse(data))
    return result.success ? result.data : undefined
  } catch {
    return undefined // not even JSON
  }
}
