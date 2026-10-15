import { ObjectId, type ClientSession } from 'mongodb'
import type { Anchor } from '../../../shared/anchor'
import { annotations, counters, documents, mongo } from '../db'
import type { AnnotationDoc, UserDoc } from '../models'
import { AppError } from './errors'
import { channelKey } from './channel'

export type Student = UserDoc & { groupId: string }

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
  // `?.` / `?? null`: documents written before these fields existed don't have them.
  editedAt: editedAt?.toISOString() ?? null,
  deletedAt: deletedAt?.toISOString() ?? null,
  ...rest,
})

/**
 * The sequencing primitive. Runs `fn` in a transaction that first bumps the channel counter.
 *
 * Why a transaction: the counter doc is a write-conflict point, so two writers on the same
 * channel serialize, and commit order == seq order. A reader (replay/change stream) therefore
 * never sees seq 6 become visible before seq 5. If `fn` throws, the increment rolls back too,
 * so sequence numbers are gapless — which is what lets the hub detect a dropped event by
 * "seq != lastSeen + 1" with no false positives.
 */
async function withNextSeq<T>(documentId: string, groupId: string, fn: (seq: number, session: ClientSession) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await mongo.withSession(session =>
        session.withTransaction(
          async () => {
            const c = await counters.findOneAndUpdate(
              { _id: channelKey(documentId, groupId) },
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

export async function createRoot(user: Student, documentId: string, input: { anchor: Anchor; body: string }) {
  const doc = await documents.findOne({ _id: documentId })
  if (!doc) throw new AppError(404, 'document not found')
  const { anchor } = input
  // Never trust the client's offsets: the quote must actually be there.
  if (anchor.end > doc.text.length || doc.text.slice(anchor.start, anchor.end) !== anchor.exact)
    throw new AppError(400, 'anchor does not match document text')

  return withNextSeq(documentId, user.groupId, async (seq, session) => {
    const a: AnnotationDoc = {
      _id: new ObjectId().toHexString(),
      documentId,
      groupId: user.groupId,
      seq,
      kind: 'root',
      parentId: null,
      authorId: user._id,
      authorName: user.name,
      body: input.body,
      anchor,
      docVersion: doc.version,
      upvoterIds: [],
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
    }
    await annotations.insertOne(a, { session })
    return a
  })
}

export async function createReply(user: Student, parentId: string, body: string) {
  const parent = await annotations.findOne({ _id: parentId })
  // Same 404 for "doesn't exist" and "other group's": don't leak existence across groups.
  if (!parent || parent.groupId !== user.groupId || parent.deletedAt) throw new AppError(404, 'annotation not found')
  if (parent.kind !== 'root') throw new AppError(400, 'can only reply to a top-level annotation')

  return withNextSeq(parent.documentId, user.groupId, async (seq, session) => {
    const a: AnnotationDoc = {
      _id: new ObjectId().toHexString(),
      documentId: parent.documentId,
      groupId: parent.groupId, // copied from the parent so the channel is never derived by a join
      seq,
      kind: 'reply',
      parentId: parent._id,
      authorId: user._id,
      authorName: user.name,
      body,
      anchor: null,
      docVersion: parent.docVersion,
      upvoterIds: [],
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
    }
    await annotations.insertOne(a, { session })
    return a
  })
}

/** Toggle. An upvote is a mutation of the post, so it takes a fresh seq and is broadcast/replayed like any write. */
export async function toggleUpvote(user: Student, annotationId: string) {
  const target = await annotations.findOne({ _id: annotationId })
  if (!target || target.groupId !== user.groupId || target.deletedAt) throw new AppError(404, 'annotation not found')
  if (target.authorId === user._id) throw new AppError(400, "can't upvote your own post")

  return withNextSeq(target.documentId, target.groupId, async (seq, session) => {
    // Re-read inside the transaction: the counter lock means no other writer on this channel interleaves.
    const current = await annotations.findOne({ _id: annotationId }, { session })
    if (current!.deletedAt) throw new AppError(404, 'annotation not found') // deleted since we looked
    const has = current!.upvoterIds.includes(user._id)
    const updated = await annotations.findOneAndUpdate(
      { _id: annotationId },
      { $set: { seq }, ...(has ? { $pull: { upvoterIds: user._id } } : { $addToSet: { upvoterIds: user._id } }) },
      { returnDocument: 'after', session },
    )
    return updated!
  })
}

/** Shared preconditions for edit/delete: visible to this user's group, not already deleted, and theirs. */
async function loadOwn(user: Student, id: string) {
  const t = await annotations.findOne({ _id: id })
  if (!t || t.groupId !== user.groupId || t.deletedAt) throw new AppError(404, 'annotation not found')
  if (t.authorId !== user._id) throw new AppError(403, 'only the author can change this post')
  return t
}

/** Edits take a fresh seq like any write, so they broadcast live and replay on reconnect. */
export async function editAnnotation(user: Student, id: string, body: string) {
  const t = await loadOwn(user, id)
  return withNextSeq(t.documentId, t.groupId, async (seq, session) => {
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
 * Tombstone, not removal (see AnnotationDoc.deletedAt). The body and votes are wiped so the content is
 * really gone; the row stays so every client, including ones offline right now, converges on "deleted".
 * Deleting a root leaves its replies alone: they remain readable under a "[deleted]" parent.
 */
export async function deleteAnnotation(user: Student, id: string) {
  const t = await loadOwn(user, id)
  return withNextSeq(t.documentId, t.groupId, async (seq, session) => {
    const updated = await annotations.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { $set: { body: '', upvoterIds: [], seq, deletedAt: new Date() } },
      { returnDocument: 'after', session },
    )
    if (!updated) throw new AppError(404, 'annotation not found')
    return updated
  })
}

export const currentSeq = async (documentId: string, groupId: string) =>
  (await counters.findOne({ _id: channelKey(documentId, groupId) }))?.seq ?? 0

/** Snapshot for first load. Reads the counter FIRST so `seq` is a safe lower bound: anything newer replays. */
export async function snapshot(documentId: string, groupId: string) {
  const seq = await currentSeq(documentId, groupId)
  const list = await annotations.find({ documentId, groupId }).sort({ seq: 1 }).toArray()
  return { seq, annotations: list.map(toDTO) }
}

/**
 * Everything in the channel that changed after `afterSeq`, current state, oldest first.
 * State-based (not an event log): a post edited three times appears once, at its latest seq.
 * Clients apply by id, so replay is idempotent and converges to the same view as live delivery.
 */
export const changedAfter = (documentId: string, groupId: string, afterSeq: number) =>
  annotations.find({ documentId, groupId, seq: { $gt: afterSeq } }).sort({ seq: 1 }).toArray()
