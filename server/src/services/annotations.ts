import { HTTPException } from 'hono/http-exception'
import { MongoServerError, ObjectId } from 'mongodb'
import { annotations, readings } from '../db'
import { publish } from '../realtime/events'
import type { AnnotationDoc, UserDoc } from '../db/models'

/** Wire shape for REST and SSE. Inferred types flow from here to the Vue app via Hono RPC. */
export type AnnotationDTO = Omit<AnnotationDoc, '_id' | 'createdAt' | 'editedAt'> & {
  id: string
  createdAt: string
  editedAt: string | null
}

export const toAnnotationDTO = ({
  _id,
  createdAt,
  editedAt,
  ...rest
}: AnnotationDoc): AnnotationDTO => ({
  id: _id,
  createdAt: createdAt.toISOString(),
  editedAt: editedAt?.toISOString() ?? null,
  ...rest,
})

/** Every write tells the reading's live viewers what changed, after it has been saved. */
function saved(annotation: AnnotationDoc) {
  const dto = toAnnotationDTO(annotation)
  publish(annotation.readingId, { type: 'annotation', annotation: dto })
  return dto
}

const newAnnotation = (
  user: UserDoc,
  fields: Pick<AnnotationDoc, 'readingId' | 'kind' | 'parentId' | 'body'>,
  id = new ObjectId().toHexString(),
): AnnotationDoc => ({
  _id: id,
  ...fields,
  authorId: user._id,
  authorName: user.name,
  createdAt: new Date(),
  editedAt: null,
})

/**
 * Saves a new post. Ids can come from the client, which makes retries safe: if a post was saved but
 * its response never arrived, the retry (same id) gets the original back instead of a duplicate. Any
 * other clash on the id is refused, without revealing the post that holds it.
 */
async function insert(annotation: AnnotationDoc) {
  try {
    await annotations.insertOne(annotation)
    return saved(annotation)
  } catch (error) {
    if (!(error instanceof MongoServerError && error.code === 11000)) throw error // not a duplicate id
    const original = await annotations.findOne({ _id: annotation._id })
    const isRetry =
      original?.authorId === annotation.authorId &&
      original.parentId === annotation.parentId &&
      original.readingId === annotation.readingId &&
      original.body === annotation.body
    if (!isRetry) throw new HTTPException(409, { message: 'id already in use' })
    return toAnnotationDTO(original) // already published the first time
  }
}

export async function createRoot(user: UserDoc, readingId: string, body: string, id?: string) {
  if (!(await readings.countDocuments({ _id: readingId }, { limit: 1 })))
    throw new HTTPException(404, { message: 'reading not found' })
  return insert(newAnnotation(user, { readingId, kind: 'root', parentId: null, body }, id))
}

export async function createReply(user: UserDoc, parentId: string, body: string, id?: string) {
  const parent = await annotations.findOne({ _id: parentId })
  if (!parent) throw new HTTPException(404, { message: 'annotation not found' })
  if (parent.kind !== 'root')
    throw new HTTPException(400, { message: 'can only reply to a top-level annotation' })
  return insert(
    newAnnotation(
      user,
      { readingId: parent.readingId, kind: 'reply', parentId: parent._id, body },
      id,
    ),
  )
}

/** Only the author may change a post. */
async function loadOwn(user: UserDoc, id: string) {
  const annotation = await annotations.findOne({ _id: id })
  if (!annotation) throw new HTTPException(404, { message: 'annotation not found' })
  if (annotation.authorId !== user._id)
    throw new HTTPException(403, { message: 'only the author can change this annotation' })
  return annotation
}

export async function updateAnnotation(user: UserDoc, id: string, body: string) {
  const current = await loadOwn(user, id)
  // Saving the same words changes nothing: not marked edited, and nobody is notified.
  if (current.body === body) return toAnnotationDTO(current)
  const updated = await annotations.findOneAndUpdate(
    { _id: id },
    { $set: { body, editedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!updated) throw new HTTPException(404, { message: 'annotation not found' }) // deleted between the check and the update
  return saved(updated)
}

/**
 * Deleting a top-level annotation deletes its replies too: a thread without its opening comment has
 * no context. One deleteMany does both (a reply has no replies, so for one this deletes just itself).
 * The event carries only this id; clients drop its replies themselves, since they know each parentId.
 */
export async function deleteAnnotation(user: UserDoc, id: string) {
  const annotation = await loadOwn(user, id)
  await annotations.deleteMany({ $or: [{ _id: id }, { parentId: id }] })
  publish(annotation.readingId, { type: 'deleted', id })
  return { id }
}

/** A reading's whole discussion, newest first. The client groups replies under their roots. */
export const listAnnotations = async (readingId: string) =>
  (await annotations.find({ readingId }).sort({ createdAt: -1 }).toArray()).map(toAnnotationDTO)
