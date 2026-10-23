export interface UserDoc {
  _id: string
  name: string
  role: 'student' | 'instructor'
}

export interface DocumentDoc {
  _id: string
  title: string
  author: string
  text: string
  wordCount: number
}

/**
 * Root comments and replies share ONE collection so a single change stream (and a single
 * per-document sequence) covers a document's whole conversation. `kind` and `parentId` tell
 * them apart. Replies are one level deep (parentId always points at a root).
 */
export interface AnnotationDoc {
  _id: string
  documentId: string
  /** Per-document monotonic, gapless; re-stamped on EVERY mutation. */
  seq: number
  kind: 'root' | 'reply'
  parentId: string | null
  authorId: string
  /** Denormalized: names are display-only here, and a thread render shouldn't need a user join. */
  authorName: string
  body: string
  createdAt: Date
  /** Set when the author edits the body. */
  editedAt: Date | null
  /**
   * Soft delete. A hard delete can't be replayed: replay is "current state of everything changed after
   * seq N", and a vanished row is not a changed row, so an offline client would never learn it was removed.
   * A tombstone is a normal write (new seq, change-stream event, replayed like any other), with the body wiped.
   */
  deletedAt: Date | null
}

export interface CounterDoc {
  _id: string // documentId
  seq: number
}
