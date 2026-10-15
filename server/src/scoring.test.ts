import { describe, expect, it } from 'vitest'
import { computeScores, DEFAULT_SCORING, type ActivityRecord } from './scoring'

const long = 40
const records: ActivityRecord[] = [
  { authorId: 'alice', kind: 'root', bodyLength: long, upvoterIds: ['bob', 'carol'] },
  { authorId: 'bob', kind: 'reply', bodyLength: long, upvoterIds: [] },
  { authorId: 'bob', kind: 'root', bodyLength: 5, upvoterIds: ['alice'] }, // too short to earn anything
]

describe('scoring', () => {
  it('derives per-user activity and a weighted score', () => {
    const s = computeScores(records, DEFAULT_SCORING)
    expect(s.get('alice')).toMatchObject({ comments: 1, upvotesReceived: 2, upvotesGiven: 1, score: 5 + 2 + 0.5 })
    expect(s.get('bob')).toMatchObject({ comments: 0, replies: 1, upvotesGiven: 1, score: 3 + 0.5 })
  })

  it('re-scores history when the config changes (nothing is stored)', () => {
    const before = computeScores(records, DEFAULT_SCORING).get('alice')!.score
    const after = computeScores(records, { ...DEFAULT_SCORING, commentPoints: 20 }).get('alice')!.score
    expect(after - before).toBe(15)
  })

  it('caps upvotes counted per post and honors the minimum length', () => {
    const viral: ActivityRecord[] = [{ authorId: 'a', kind: 'root', bodyLength: long, upvoterIds: ['1', '2', '3', '4', '5', '6', '7'] }]
    expect(computeScores(viral, DEFAULT_SCORING).get('a')!.upvotesReceived).toBe(5)
    expect(computeScores(records, { ...DEFAULT_SCORING, minChars: 1 }).get('bob')!.comments).toBe(1)
  })
})
