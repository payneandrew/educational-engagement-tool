import { resolve } from 'node:path'
import { createIndexes, db, initDb, mongo, readings, users } from './db'
import type { ReadingDoc, UserDoc } from './models'
import { createReply, createRoot } from './services/annotations'

const USERS: UserDoc[] = [
  { _id: 'u-alice', name: 'Alice Chen', role: 'student' },
  { _id: 'u-bob', name: 'Bob Okafor', role: 'student' },
  { _id: 'u-carol', name: 'Carol Silva', role: 'student' },
  { _id: 'u-dana', name: 'Prof. Dana Reyes', role: 'instructor' },
]

// Fixed ids (rather than generated ones) so tests and links can refer to them. Staggered createdAt so
// the newest-first list has a stable order.
const day = (n: number) => new Date(Date.UTC(2026, 8, n, 14))
const READINGS: ReadingDoc[] = [
  {
    _id: 'civil-disobedience',
    title: 'Thoreau — On the Duty of Civil Disobedience',
    description:
      'Read the full essay (about 30 pages). Focus on Thoreau’s argument for when an individual may refuse to obey the law, and come ready to say whether you find it convincing.',
    createdBy: 'u-dana',
    createdByName: 'Prof. Dana Reyes',
    createdAt: day(1),
  },
  {
    _id: 'on-liberty-ch2',
    title: 'Mill — On Liberty, Chapter 2',
    description:
      '“Of the Liberty of Thought and Discussion.” Identify Mill’s three cases for why silencing an opinion is wrong, and annotate the one you find weakest.',
    createdBy: 'u-dana',
    createdByName: 'Prof. Dana Reyes',
    createdAt: day(8),
  },
  {
    _id: 'natural-selection',
    title: 'Darwin — On the Origin of Species, Chapter 4',
    description:
      '“Natural Selection.” Pay attention to how Darwin argues from artificial selection by breeders to selection in nature. Where is the analogy strongest, and where does it strain?',
    createdBy: 'u-dana',
    createdByName: 'Prof. Dana Reyes',
    createdAt: day(15),
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
  await Promise.all(names.map((n) => db.dropCollection(n).catch(() => {})))
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

// `npm run seed` — reset the database to its initial state.
if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  await initDb()
  await seed()
  console.log('[seed] done')
  await mongo.close()
}
