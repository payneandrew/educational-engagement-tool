export interface UserDoc {
  _id: string
  name: string
  role: 'student' | 'instructor'
}

export interface ReadingDoc {
  _id: string
  title: string
  description: string
  /** The instructor's user id. */
  createdBy: string
  /** Denormalized, like authorName. */
  createdByName: string
  createdAt: Date
}

/** Roots and replies share one collection; replies are one level deep (parentId is always a root). */
export interface AnnotationDoc {
  _id: string
  readingId: string
  kind: 'root' | 'reply'
  parentId: string | null
  authorId: string
  /** Denormalized so rendering a thread needs no user lookup. */
  authorName: string
  body: string
  createdAt: Date
  editedAt: Date | null
}
