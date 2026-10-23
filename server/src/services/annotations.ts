import { ObjectId, type ClientSession } from 'mongodb'
import { annotations, counters, documents, mongo } from '../db'
import type { AnnotationDoc, UserDoc } from '../models'
import { AppError } from './errors'

/** Wire shape for REST and SSE. Inferred types flow from here to the Vue app via Hono RPC. */
export type AnnotationDTO = Omit<AnnotationDoc, '_id' | 'createdAt' | 'editedAt' | 'deletedAt'> & {
  id: string
  createdAt: string
  editedAt: string | null
  deletedAt: string | null
}

export const toDTO = ({ _id, createdAt, editedAt, deletedAt, ...rest }: AnnotationDoc): AnnotationDTO => ({
  id: _id,
  createdAt: createdAt.toISOString(),
  editedAt: editedAt?.toISOString() ?? null,
  deletedAt: deletedAt?.toISOString() ?? null,
  ...rest,
})

/**
 * The sequencing primitive. Runs `fn` in a transaction that first bumps the document's counter.
 *
 * Why a transaction: the counter doc is a write-conflict point, so two writers on the same
 * document serialize, and commit order == seq order. A reader (replay/change stream) therefore
 * never sees seq 6 become visible before seq 5. If `fn` throws, the increment rolls back too,
 * so sequence numbers are gapless — which is what lets the hub detect a dropped event by
 * "seq != lastSeen + 1" with no false positives.
 */
async function withNextSeq<T>(documentId: string, fn: (seq: number, session: ClientSession) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await mongo.withSession(session =>
        session.withTransaction(
          async () => {
            const c = await counters.findOneAndUpdate(
              { _id: documentId },
              { $inc: { seq: 1 } },
              { upsert: true, returnDocument: 'after', session },
            )
            return fn(c!.seq, session)
          },
          { writeConcern: { w: 'majority' }, readConcern: { level: 'snapshot' } },
        ),
      )
    } catch (e: any) {
      // Two first-ever writers racing to upsert the same counter: one gets E11000. Retry.
      if (e?.code === 11000 && attempt < 3) continue
      throw e
    }
  }
}

const newAnnotation = (user: UserDoc, fields: Pick<AnnotationDoc, 'documentId' | 'seq' | 'kind' | 'parentId' | 'body'>): AnnotationDoc => ({
  _id: new ObjectId().toHexString(),
  ...fields,
  authorId: user._id,
  authorName: user.name,
  createdAt: new Date(),
  editedAt: null,
  deletedAt: null,
})

export async function createRoot(user: UserDoc, documentId: string, body: string) {
  if (!(await documents.countDocuments({ _id: documentId }, { limit: 1 }))) throw new AppError(404, 'document not found')
  return withNextSeq(documentId, async (seq, session) => {
    const a = newAnnotation(user, { documentId, seq, kind: 'root', parentId: null, body })
    await annotations.insertOne(a, { session })
    return a
  })
}

export async function createReply(user: UserDoc, parentId: string, body: string) {
  const parent = await annotations.findOne({ _id: parentId })
  if (!parent || parent.deletedAt) throw new AppError(404, 'annotation not found')
  if (parent.kind !== 'root') throw new AppError(400, 'can only reply to a top-level annotation')

  return withNextSeq(parent.documentId, async (seq, session) => {
    const a = newAnnotation(user, { documentId: parent.documentId, seq, kind: 'reply', parentId: parent._id, body })
    await annotations.insertOne(a, { session })
    return a
  })
}

/** Shared preconditions for edit/delete: exists, not already deleted, and theirs. */
async function loadOwn(user: UserDoc, id: string) {
  const t = await annotations.findOne({ _id: id })
  if (!t || t.deletedAt) throw new AppError(404, 'annotation not found')
  if (t.authorId !== user._id) throw new AppError(403, 'only the author can change this post')
  return t
}

/** Edits take a fresh seq like any write, so they broadcast live and replay on reconnect. */
export async function editAnnotation(user: UserDoc, id: string, body: string) {
  const t = await loadOwn(user, id)
  return withNextSeq(t.documentId, async (seq, session) => {
    // The `deletedAt: null` filter makes a concurrent delete win; our txn (and its seq bump) then aborts.
    const updated = await annotations.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { body, seq, editedAt: new Date() } },
      { returnDocument: 'after', session },
    )
    if (!updated) throw new AppError(404, 'annotation not found')
    return updated
  })
}

/**
 * Tombstone, not removal (see AnnotationDoc.deletedAt). The body is wiped so the content is really
 * gone; the row stays so every client, including ones offline right now, converges on "deleted".
 * Deleting a root leaves its replies alone: they remain readable under a "[deleted]" parent.
 */
export async function deleteAnnotation(user: UserDoc, id: string) {
  const t = await loadOwn(user, id)
  return withNextSeq(t.documentId, async (seq, session) => {
    const updated = await annotations.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { body: '', seq, deletedAt: new Date() } },
      { returnDocument: 'after', session },
    )
    if (!updated) throw new AppError(404, 'annotation not found')
    return updated
  })
}

export const currentSeq = async (documentId: string) => (await counters.findOne({ _id: documentId }))?.seq ?? 0

/** Snapshot for first load. Reads the counter FIRST so `seq` is a safe lower bound: anything newer replays. */
export async function snapshot(documentId: string) {
  const seq = await currentSeq(documentId)
  const list = await annotations.find({ documentId }).sort({ seq: 1 }).toArray()
  return { seq, annotations: list.map(toDTO) }
}

/**
 * Everything on the document that changed after `afterSeq`, current state, oldest first.
 * State-based (not an event log): a post edited three times appears once, at its latest seq.
 * Clients apply by id, so replay is idempotent and converges to the same view as live delivery.
 */
export const changedAfter = (documentId: string, afterSeq: number) =>
  annotations.find({ documentId, seq: { $gt: afterSeq } }).sort({ seq: 1 }).toArray()
