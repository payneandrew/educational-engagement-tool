import { annotations, groups, settings, users } from '../db'
import type { ScoringConfig } from '../models'
import { computeScores, DEFAULT_SCORING, type ActivityRecord } from '../scoring'

export async function getScoringConfig(): Promise<ScoringConfig> {
  const s = await settings.findOne({ _id: 'scoring' })
  return { ...DEFAULT_SCORING, ...s?.value }
}

export async function setScoringConfig(value: ScoringConfig) {
  await settings.updateOne({ _id: 'scoring' }, { $set: { value, updatedAt: new Date() } }, { upsert: true })
  return value
}

/** Read-time derivation: project the minimum fields, score in-process, join to users for display. */
export async function scoresForDocument(documentId: string) {
  const [config, records, students, grps] = await Promise.all([
    getScoringConfig(),
    annotations
      .aggregate<ActivityRecord>([
        // Deleted posts earn nothing (and votes on them are gone), so deleting can't be used to bank points.
        { $match: { documentId, deletedAt: null } },
        { $project: { _id: 0, authorId: 1, kind: 1, upvoterIds: 1, bodyLength: { $strLenCP: '$body' } } },
      ])
      .toArray(),
    users.find({ role: 'student' }).toArray(),
    groups.find().toArray(),
  ])
  const scores = computeScores(records, config)
  const groupName = new Map(grps.map(g => [g._id, g.name]))
  const rows = students
    .map(u => ({
      userId: u._id,
      name: u.name,
      groupId: u.groupId!,
      groupName: groupName.get(u.groupId!) ?? u.groupId!,
      ...(scores.get(u._id) ?? { comments: 0, replies: 0, upvotesReceived: 0, upvotesGiven: 0, score: 0 }),
    }))
    .sort((a, b) => b.score - a.score)
  return { config, rows }
}
