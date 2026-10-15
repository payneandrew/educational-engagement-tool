import type { Anchor } from '../../shared/anchor'

export interface GroupDoc {
  _id: string
  name: string
}

export interface UserDoc {
  _id: string
  name: string
  role: 'student' | 'instructor'
  /** Students belong to exactly one group; instructors have none and see across groups. */
  groupId: string | null
}

export interface DocumentDoc {
  _id: string
  title: string
  author: string
  text: string
  /** Bumped whenever `text` changes; annotations remember which version they were anchored against. */
  version: number
  wordCount: number
}

/**
 * Root comments and replies share ONE collection so a single change stream (and a single
 * per-channel sequence) covers a document's whole conversation. `kind` and `parentId` tell
 * them apart. Replies are one level deep (parentId always points at a root).
 */
export interface AnnotationDoc {
  _id: string
  documentId: string
  /** Denormalized from the author: this is the channel key. Routing/replay never joins to users. */
  groupId: string
  /** Per-channel (documentId+groupId) monotonic, gapless; re-stamped on EVERY mutation. */
  seq: number
  kind: 'root' | 'reply'
  parentId: string | null
  authorId: string
  /** Denormalized: names are display-only here, and a thread render shouldn't need a user join. */
  authorName: string
  body: string
  /** Only on roots. */
  anchor: Anchor | null
  docVersion: number
  /** Embedded rather than a separate votes collection: a post's voters are small, bounded, and always read with it. */
  upvoterIds: string[]
  createdAt: Date
  /** Set when the author edits the body. */
  editedAt: Date | null
  /**
   * Soft delete. A hard delete can't be replayed: replay is "current state of everything changed after
   * seq N", and a vanished row is not a changed row, so an offline client would never learn it was removed.
   * A tombstone is a normal write (new seq, change-stream event, replayed like any other), with the body and
   * votes wiped. Docs written before this field existed read as `undefined`, which `{ deletedAt: null }` matches.
   */
  deletedAt: Date | null
}

export interface CounterDoc {
  _id: string // channelKey
  seq: number
}

export interface ScoringConfig {
  commentPoints: number
  replyPoints: number
  upvoteReceivedPoints: number
  upvoteGivenPoints: number
  /** Posts shorter than this earn nothing (discourages "lol"/"+1" farming). */
  minChars: number
  /** Cap on upvotes that count per post (discourages one viral post dominating). */
  maxUpvotesPerPost: number
}

export interface SettingDoc {
  _id: string
  value: ScoringConfig
  updatedAt: Date
}
