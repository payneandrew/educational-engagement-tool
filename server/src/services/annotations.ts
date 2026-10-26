import { HTTPException } from 'hono/http-exception'
import { ObjectId } from 'mongodb'
import { annotations, readings } from '../db'
import { publish } from '../realtime/events'
import type { AnnotationDoc, UserDoc } from '../db/models'

/** Wire shape for REST and Socket.IO. Inferred types flow from here to the Vue app via Hono RPC. */
export type AnnotationDTO = Omit<AnnotationDoc, '_id' | 'createdAt' | 'editedAt'> & {
  id: string
  createdAt: string
  editedAt: string | null
}

export const toDTO = ({ _id, createdAt, editedAt, ...rest }: AnnotationDoc): AnnotationDTO => ({
  id: _id,
  createdAt: createdAt.toISOString(),
  editedAt: editedAt?.toISOString() ?? null,
  ...rest,
})

/** Every write tells the reading's live viewers what changed, after it has been saved. */
function saved(annotation: AnnotationDoc, type: 'created' | 'updated') {
  const dto = toDTO(annotation)
  publish({ type, annotation: dto })
  return dto
}

const newAnnotation = (
  user: UserDoc,
  fields: Pick<AnnotationDoc, 'readingId' | 'kind' | 'parentId' | 'body'>,
): AnnotationDoc => ({
  _id: new ObjectId().toHexString(),
  ...fields,
  authorId: user._id,
  authorName: user.name,
  createdAt: new Date(),
  editedAt: null,
})

export async function createRoot(user: UserDoc, readingId: string, body: string) {
  if (!(await readings.countDocuments({ _id: readingId }, { limit: 1 })))
    throw new HTTPException(404, { message: 'reading not found' })
  const annotation = newAnnotation(user, { readingId, kind: 'root', parentId: null, body })
  await annotations.insertOne(annotation)
  return saved(annotation, 'created')
}

export async function createReply(user: UserDoc, parentId: string, body: string) {
  const parent = await annotations.findOne({ _id: parentId })
  if (!parent) throw new HTTPException(404, { message: 'annotation not found' })
  if (parent.kind !== 'root')
    throw new HTTPException(400, { message: 'can only reply to a top-level annotation' })
  const annotation = newAnnotation(user, {
    readingId: parent.readingId,
    kind: 'reply',
    parentId: parent._id,
    body,
  })
  await annotations.insertOne(annotation)
  return saved(annotation, 'created')
}

/** Only the author may change a post. */
async function loadOwn(user: UserDoc, id: string) {
  const annotation = await annotations.findOne({ _id: id })
  if (!annotation) throw new HTTPException(404, { message: 'annotation not found' })
  if (annotation.authorId !== user._id)
    throw new HTTPException(403, { message: 'only the author can change this annotation' })
  return annotation
}

export async function editAnnotation(user: UserDoc, id: string, body: string) {
  await loadOwn(user, id)
  const updated = await annotations.findOneAndUpdate(
    { _id: id },
    { $set: { body, editedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!updated) throw new HTTPException(404, { message: 'annotation not found' }) // deleted between the check and the update
  return saved(updated, 'updated')
}

/**
 * Deleting a top-level annotation deletes its replies too: a thread without its opening comment has
 * no context. One deleteMany does both (a reply has no replies, so for one this deletes just itself).
 * The event carries only this id; clients drop its replies themselves, since they know each parentId.
 */
export async function deleteAnnotation(user: UserDoc, id: string) {
  const annotation = await loadOwn(user, id)
  await annotations.deleteMany({ $or: [{ _id: id }, { parentId: id }] })
  publish({ type: 'deleted', id, readingId: annotation.readingId })
  return { id }
}

/** A reading's whole discussion, newest first. The client groups replies under their roots. */
export const listAnnotations = async (readingId: string) =>
  (await annotations.find({ readingId }).sort({ createdAt: -1 }).toArray()).map(toDTO)
