import { ObjectId } from 'mongodb'
import { annotations, createIndexes, db, readings, users } from '../db'
import type { AnnotationDoc, ReadingDoc, UserDoc } from '../db/models'
import {
  DEMO_READINGS,
  DEMO_THREADS,
  DEMO_USERS,
  type SeedPost,
  type SeedThread,
} from './demo-data'

const USERS: UserDoc[] = [
  { _id: 'u-alice', name: 'Alice Chen', role: 'student' },
  { _id: 'u-bob', name: 'Bob Okafor', role: 'student' },
  { _id: 'u-carol', name: 'Carol Silva', role: 'student' },
  { _id: 'u-dana', name: 'Prof. Dana Reyes', role: 'instructor' },
]

// Fixed ids (rather than generated ones) so tests and links can refer to them. Staggered createdAt so
// the newest-first list has a stable order.
const september = (dayOfMonth: number) => new Date(Date.UTC(2026, 8, dayOfMonth, 14))
const READINGS: ReadingDoc[] = [
  {
    _id: 'civil-disobedience',
    title: 'Thoreau — On the Duty of Civil Disobedience',
    description:
      'Read the full essay (about 30 pages). Focus on Thoreau’s argument for when an individual may refuse to obey the law, and come ready to say whether you find it convincing.',
    createdBy: 'u-dana',
    createdByName: 'Prof. Dana Reyes',
    createdAt: september(1),
  },
  {
    _id: 'on-liberty-ch2',
    title: 'Mill — On Liberty, Chapter 2',
    description:
      '“Of the Liberty of Thought and Discussion.” Identify Mill’s three cases for why silencing an opinion is wrong, and annotate the one you find weakest.',
    createdBy: 'u-dana',
    createdByName: 'Prof. Dana Reyes',
    createdAt: september(8),
  },
  {
    _id: 'natural-selection',
    title: 'Darwin — On the Origin of Species, Chapter 4',
    description:
      '“Natural Selection.” Pay attention to how Darwin argues from artificial selection by breeders to selection in nature. Where is the analogy strongest, and where does it strain?',
    createdBy: 'u-dana',
    createdByName: 'Prof. Dana Reyes',
    createdAt: september(15),
  },
]

/**
 * The base discussion, timed like the demo data: `at` is hours after the reading was assigned. Fixed
 * times (rather than "now") keep a reading's discussion in order next to the demo posts, and keep it
 * the same on every reseed.
 */
const THREADS: Record<string, SeedThread[]> = {
  'civil-disobedience': [
    {
      by: 'u-alice',
      at: 8,
      body: 'Thoreau says "we should be men first, and subjects afterward." Is putting moral agency before civic obedience still defensible in a complex state?',
      replies: [
        {
          by: 'u-bob',
          at: 11,
          body: 'I think so, but Thoreau skips over who decides what conscience demands.',
        },
        {
          by: 'u-carol',
          at: 16,
          body: 'We read it as a claim about individual duty rather than collective action.',
        },
      ],
    },
    {
      by: 'u-bob',
      at: 30,
      body: 'Nice reversal of the "corporations have no conscience" line near the start.',
    },
  ],
  'on-liberty-ch2': [
    {
      by: 'u-alice',
      at: 6,
      body: 'Mill’s core move: silencing an opinion presumes you cannot be wrong.',
    },
  ],
}

/**
 * Seed threads as annotation documents. Inserted directly rather than through the service functions,
 * which always stamp "now" (and publish live events nobody is listening to yet).
 */
function toAnnotations(
  threadsByReading: Record<string, SeedThread[]>,
  people: UserDoc[],
  readingList: ReadingDoc[],
): AnnotationDoc[] {
  const userById = new Map(people.map((user) => [user._id, user]))
  const assignedAt = new Map(readingList.map((reading) => [reading._id, reading.createdAt]))
  const result: AnnotationDoc[] = []
  const add = (readingId: string, post: SeedPost, parentId: string | null) => {
    const author = userById.get(post.by)
    if (!author) throw new Error(`seed post by unknown user: ${post.by}`)
    const assigned = assignedAt.get(readingId)
    if (!assigned) throw new Error(`seed thread on unknown reading: ${readingId}`)
    const hoursIn = (hours: number) => new Date(assigned.getTime() + hours * 3_600_000)
    const annotation: AnnotationDoc = {
      _id: new ObjectId().toHexString(),
      readingId,
      kind: parentId ? 'reply' : 'root',
      parentId,
      authorId: author._id,
      authorName: author.name,
      body: post.body,
      createdAt: hoursIn(post.at),
      editedAt: post.editedAt === undefined ? null : hoursIn(post.editedAt),
    }
    result.push(annotation)
    return annotation
  }
  for (const [readingId, threads] of Object.entries(threadsByReading))
    for (const thread of threads) {
      const root = add(readingId, thread, null)
      for (const reply of thread.replies ?? []) add(readingId, reply, root._id)
    }
  return result
}

/** Wipes and reseeds with the small base set the tests use. */
export async function seed(): Promise<void> {
  // Drop (not just empty) so indexes from earlier versions of the app go too. Missing collections are fine.
  // `documents`, `groups`, `settings` and `channel_counters` are from earlier versions of the app.
  const names = [
    'annotations',
    'readings',
    'users',
    'documents',
    'groups',
    'settings',
    'channel_counters',
  ]
  await Promise.all(names.map((name) => db.dropCollection(name).catch(() => {})))
  await createIndexes()
  await users.insertMany(USERS)
  await readings.insertMany(READINGS)
  await annotations.insertMany(toAnnotations(THREADS, USERS, READINGS))
}

/**
 * The base seed plus the demo data (demo-data.ts): more students, readings and discussion, for trying
 * the app by hand.
 */
export async function seedDemo(): Promise<void> {
  await seed()
  await users.insertMany(DEMO_USERS)
  await readings.insertMany(DEMO_READINGS)
  await annotations.insertMany(
    toAnnotations(DEMO_THREADS, [...USERS, ...DEMO_USERS], [...READINGS, ...DEMO_READINGS]),
  )
}
