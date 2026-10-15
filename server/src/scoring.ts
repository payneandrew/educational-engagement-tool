import type { ScoringConfig } from './models'

export const DEFAULT_SCORING: ScoringConfig = {
  commentPoints: 5,
  replyPoints: 3,
  upvoteReceivedPoints: 1,
  upvoteGivenPoints: 0.5,
  minChars: 20,
  maxUpvotesPerPost: 5,
}

/** The minimum we need to know about a post to score it. Scores are a pure function of these + config. */
export interface ActivityRecord {
  authorId: string
  kind: 'root' | 'reply'
  bodyLength: number
  upvoterIds: string[]
}

export interface UserScore {
  comments: number
  replies: number
  upvotesReceived: number
  upvotesGiven: number
  score: number
}

/**
 * Pure and deterministic: nothing is stored. Because the score is derived on read from the
 * raw posts, editing the config re-scores all history instantly — there's no backfill job and
 * nothing to go stale. (The tradeoff is read cost; see README for the rollup strategy at scale.)
 */
export function computeScores(records: ActivityRecord[], cfg: ScoringConfig): Map<string, UserScore> {
  const out = new Map<string, UserScore>()
  const row = (id: string) => {
    let r = out.get(id)
    if (!r) out.set(id, (r = { comments: 0, replies: 0, upvotesReceived: 0, upvotesGiven: 0, score: 0 }))
    return r
  }
  for (const rec of records) {
    // Upvoting is credited to the voter regardless of the post's length — they engaged.
    for (const voter of rec.upvoterIds) row(voter).upvotesGiven++

    if (rec.bodyLength < cfg.minChars) continue // too short to count for the author
    const author = row(rec.authorId)
    if (rec.kind === 'root') author.comments++
    else author.replies++
    author.upvotesReceived += Math.min(rec.upvoterIds.length, cfg.maxUpvotesPerPost)
  }
  for (const r of out.values()) {
    r.score =
      r.comments * cfg.commentPoints +
      r.replies * cfg.replyPoints +
      r.upvotesReceived * cfg.upvoteReceivedPoints +
      r.upvotesGiven * cfg.upvoteGivenPoints
  }
  return out
}
