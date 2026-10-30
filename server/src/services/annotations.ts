import { HTTPException } from 'hono/http-exception'
import { MongoServerError, ObjectId } from 'mongodb'
import { annotations, readings } from '../db'
import { publish } from '../realtime/events'
import type { AnnotationDoc, UserDoc } from '../db/models'
import type { AnnotationDTO } from '../realtime/schema'

export type { AnnotationDTO } from '../realtime/schema'

export type DeletedAnnotationDTO = { id: string }

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

/** Broadcasts a saved write to the reading's live viewers. */
function publishSaved(annotation: AnnotationDoc): AnnotationDTO {
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
 * Saves a new post. Ids come from the client, so a retry of a saved post (same id and content) gets
 * the original back instead of a duplicate. Any other id clash is a 409.
 */
async function insert(annotation: AnnotationDoc): Promise<AnnotationDTO> {
  try {
    await annotations.insertOne(annotation)
    return publishSaved(annotation)
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

export async function createRoot(
  user: UserDoc,
  readingId: string,
  body: string,
  id?: string,
): Promise<AnnotationDTO> {
  if (!(await readings.countDocuments({ _id: readingId }, { limit: 1 })))
    throw new HTTPException(404, { message: 'reading not found' })
  return insert(newAnnotation(user, { readingId, kind: 'root', parentId: null, body }, id))
}

export async function createReply(
  user: UserDoc,
  parentId: string,
  body: string,
  id?: string,
): Promise<AnnotationDTO> {
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

async function loadOwn(user: UserDoc, id: string): Promise<AnnotationDoc> {
  const annotation = await annotations.findOne({ _id: id })
  if (!annotation) throw new HTTPException(404, { message: 'annotation not found' })
  if (annotation.authorId !== user._id)
    throw new HTTPException(403, { message: 'only the author can change this annotation' })
  return annotation
}

export async function updateAnnotation(
  user: UserDoc,
  id: string,
  body: string,
): Promise<AnnotationDTO> {
  const current = await loadOwn(user, id)
  // Same words: not marked edited, nobody notified.
  if (current.body === body) return toAnnotationDTO(current)
  const updated = await annotations.findOneAndUpdate(
    { _id: id },
    { $set: { body, editedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!updated) throw new HTTPException(404, { message: 'annotation not found' }) // deleted meanwhile
  return publishSaved(updated)
}

/**
 * Deleting a top-level annotation deletes its replies too. The event carries only this id; clients
 * drop the replies themselves via parentId.
 */
export async function deleteAnnotation(user: UserDoc, id: string): Promise<DeletedAnnotationDTO> {
  const annotation = await loadOwn(user, id)
  await annotations.deleteMany({ $or: [{ _id: id }, { parentId: id }] })
  publish(annotation.readingId, { type: 'deleted', id })
  return { id }
}

/** A reading's whole discussion, newest first. */
export const listAnnotations = async (readingId: string): Promise<AnnotationDTO[]> =>
  (await annotations.find({ readingId }).sort({ createdAt: -1 }).toArray()).map(toAnnotationDTO)
