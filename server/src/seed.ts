import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { annotations, counters, db, documents, initDb, mongo, users } from './db'
import type { DocumentDoc, UserDoc } from './models'
import { createReply, createRoot } from './services/annotations'

const read = (f: string) => readFileSync(resolve(import.meta.dirname, '../../seed-data', f), 'utf8').trim()
const words = (t: string) => t.split(/\s+/).length

const USERS: UserDoc[] = [
  { _id: 'u-alice', name: 'Alice Chen', role: 'student' },
  { _id: 'u-bob', name: 'Bob Okafor', role: 'student' },
  { _id: 'u-carol', name: 'Carol Silva', role: 'student' },
  { _id: 'u-dana', name: 'Prof. Dana Reyes', role: 'instructor' },
]
const DOCS: Omit<DocumentDoc, 'wordCount'>[] = [
  { _id: 'civil-disobedience', title: 'On the Duty of Civil Disobedience', author: 'Henry David Thoreau', text: read('civil-disobedience.txt') },
  { _id: 'on-liberty-ch2', title: 'On Liberty — Of the Liberty of Thought and Discussion', author: 'John Stuart Mill', text: read('on-liberty-ch2.txt') },
  { _id: 'natural-selection', title: 'On the Origin of Species — Natural Selection', author: 'Charles Darwin', text: read('natural-selection.txt') },
]

/** Wipes and reseeds. Goes through the real write path so seq numbers/counters are genuine. */
export async function seed() {
  await Promise.all([annotations, counters, documents, users].map(c => c.deleteMany({})))
  // Collections from earlier versions of the app (groups, scoring config); harmless if absent.
  await Promise.all(['groups', 'settings'].map(n => db.dropCollection(n).catch(() => {})))
  await users.insertMany(USERS)
  await documents.insertMany(DOCS.map(d => ({ ...d, wordCount: words(d.text) })))

  const [alice, bob, carol] = USERS
  const c1 = await createRoot(
    alice,
    'civil-disobedience',
    'Thoreau says "we should be men first, and subjects afterward." Is putting moral agency before civic obedience still defensible in a complex state?',
  )
  await createReply(bob, c1._id, 'I think so, but Thoreau skips over who decides what conscience demands.')
  await createReply(carol, c1._id, 'We read it as a claim about individual duty rather than collective action.')
  await createRoot(bob, 'civil-disobedience', 'Nice reversal of the "corporations have no conscience" line near the start.')
  await createRoot(alice, 'on-liberty-ch2', 'Mill’s core move: silencing an opinion presumes you cannot be wrong.')
}

// `npm run seed` — reset the database to its initial state.
if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  await initDb()
  await seed()
  console.log('[seed] done')
  await mongo.close()
}
