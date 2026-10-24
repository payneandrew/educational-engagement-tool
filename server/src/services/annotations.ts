import { ObjectId } from 'mongodb'
import { annotations, readings } from '../db'
import { publish } from '../events'
import type { AnnotationDoc, UserDoc } from '../models'
import { AppError } from './errors'

/** Wire shape for REST and SSE. Inferred types flow from here to the Vue app via Hono RPC. */
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
function saved(a: AnnotationDoc) {
  const dto = toDTO(a)
  publish(a.readingId, { type: 'annotation', annotation: dto })
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
    throw new AppError(404, 'reading not found')
  const a = newAnnotation(user, { readingId, kind: 'root', parentId: null, body })
  await annotations.insertOne(a)
  return saved(a)
}

export async function createReply(user: UserDoc, parentId: string, body: string) {
  const parent = await annotations.findOne({ _id: parentId })
  if (!parent) throw new AppError(404, 'annotation not found')
  if (parent.kind !== 'root') throw new AppError(400, 'can only reply to a top-level annotation')
  const a = newAnnotation(user, {
    readingId: parent.readingId,
    kind: 'reply',
    parentId: parent._id,
    body,
  })
  await annotations.insertOne(a)
  return saved(a)
}

/** Only the author may change a post. */
async function loadOwn(user: UserDoc, id: string) {
  const a = await annotations.findOne({ _id: id })
  if (!a) throw new AppError(404, 'annotation not found')
  if (a.authorId !== user._id) throw new AppError(403, 'only the author can change this annotation')
  return a
}

export async function editAnnotation(user: UserDoc, id: string, body: string) {
  await loadOwn(user, id)
  const updated = await annotations.findOneAndUpdate(
    { _id: id },
    { $set: { body, editedAt: new Date() } },
    { returnDocument: 'after' },
  )
  if (!updated) throw new AppError(404, 'annotation not found') // deleted between the check and the update
  return saved(updated)
}

/** Deleting a top-level annotation deletes its replies too: a thread without its opening comment has no context. */
export async function deleteAnnotation(user: UserDoc, id: string) {
  const a = await loadOwn(user, id)
  const replyIds =
    a.kind === 'root'
      ? (await annotations.find({ parentId: id }, { projection: { _id: 1 } }).toArray()).map(
          (r) => r._id,
        )
      : []
  const ids = [id, ...replyIds]
  await annotations.deleteMany({ _id: { $in: ids } })
  publish(a.readingId, { type: 'deleted', ids })
  return { ids }
}

/** A reading's whole discussion, newest first. The client groups replies under their roots. */
export const listAnnotations = async (readingId: string) =>
  (await annotations.find({ readingId }).sort({ createdAt: -1 }).toArray()).map(toDTO)
