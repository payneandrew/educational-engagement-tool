export interface UserDoc {
  _id: string
  name: string
  role: 'student' | 'instructor'
}

/** A reading an instructor has assigned. */
export interface DocumentDoc {
  _id: string
  title: string
  description: string
  /** The instructor's user id. */
  createdBy: string
  createdAt: Date
}

/**
 * Root comments and replies share ONE collection: one query loads a reading's whole discussion.
 * `kind` and `parentId` tell them apart. Replies are one level deep (parentId always points at a root).
 */
export interface AnnotationDoc {
  _id: string
  documentId: string
  kind: 'root' | 'reply'
  parentId: string | null
  authorId: string
  /** Denormalized: names are display-only here, and a thread render shouldn't need a user join. */
  authorName: string
  body: string
  createdAt: Date
  /** Set when the author edits the body. */
  editedAt: Date | null
}
