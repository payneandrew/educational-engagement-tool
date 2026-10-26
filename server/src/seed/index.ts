import { ObjectId } from 'mongodb'
import { annotations, createIndexes, db, readings, users } from '../db'
import { DEMO_READINGS, DEMO_THREADS, DEMO_USERS, type DemoPost } from './demo-data'
import type { AnnotationDoc, ReadingDoc, UserDoc } from '../db/models'
import { createReply, createRoot } from '../services/annotations'

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

/** Wipes and reseeds. Annotations go through the real service functions, same as the API. */
export async function seed() {
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

  const [alice, bob, carol] = USERS
  const c1 = await createRoot(
    alice,
    'civil-disobedience',
    'Thoreau says "we should be men first, and subjects afterward." Is putting moral agency before civic obedience still defensible in a complex state?',
  )
  await createReply(
    bob,
    c1.id,
    'I think so, but Thoreau skips over who decides what conscience demands.',
  )
  await createReply(
    carol,
    c1.id,
    'We read it as a claim about individual duty rather than collective action.',
  )
  await createRoot(
    bob,
    'civil-disobedience',
    'Nice reversal of the "corporations have no conscience" line near the start.',
  )
  await createRoot(
    alice,
    'on-liberty-ch2',
    'Mill’s core move: silencing an opinion presumes you cannot be wrong.',
  )
}

/**
 * The base seed plus the demo data (demo-data.ts): more students, readings and discussion, for trying
 * the app by hand. Demo annotations are inserted directly so they can carry realistic past timestamps
 * (the service functions always stamp "now").
 */
export async function seedDemo() {
  await seed()
  await users.insertMany(DEMO_USERS)
  await readings.insertMany(DEMO_READINGS)

  const people = new Map([...USERS, ...DEMO_USERS].map((user) => [user._id, user]))
  const assignedAt = new Map(
    [...READINGS, ...DEMO_READINGS].map((reading) => [reading._id, reading.createdAt.getTime()]),
  )
  const demoAnnotations: AnnotationDoc[] = []
  const toAnnotation = (readingId: string, post: DemoPost, parentId: string | null) => {
    const author = people.get(post.by)!
    const hoursIn = (hours: number) => new Date(assignedAt.get(readingId)! + hours * 3_600_000)
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
    demoAnnotations.push(annotation)
    return annotation
  }
  for (const [readingId, threads] of Object.entries(DEMO_THREADS)) {
    for (const thread of threads) {
      const root = toAnnotation(readingId, thread, null)
      for (const reply of thread.replies ?? []) toAnnotation(readingId, reply, root._id)
    }
  }
  await annotations.insertMany(demoAnnotations)
}
