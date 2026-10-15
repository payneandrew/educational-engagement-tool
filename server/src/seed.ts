import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createAnchor } from '../../shared/anchor'
import { annotations, counters, documents, groups, initDb, mongo, settings, users } from './db'
import type { DocumentDoc, GroupDoc, UserDoc } from './models'
import { createReply, createRoot, toggleUpvote, type Student } from './services/annotations'

const read = (f: string) => readFileSync(resolve(import.meta.dirname, '../../seed-data', f), 'utf8').trim()
const words = (t: string) => t.split(/\s+/).length

const GROUPS: GroupDoc[] = [
  { _id: 'g-a', name: 'Group A' },
  { _id: 'g-b', name: 'Group B' },
]
const USERS: UserDoc[] = [
  { _id: 'u-alice', name: 'Alice Chen', role: 'student', groupId: 'g-a' },
  { _id: 'u-bob', name: 'Bob Okafor', role: 'student', groupId: 'g-a' },
  { _id: 'u-carol', name: 'Carol Silva', role: 'student', groupId: 'g-b' },
  { _id: 'u-dana', name: 'Prof. Dana Reyes', role: 'instructor', groupId: null },
]
const DOCS: Omit<DocumentDoc, 'wordCount'>[] = [
  { _id: 'civil-disobedience', title: 'On the Duty of Civil Disobedience', author: 'Henry David Thoreau', text: read('civil-disobedience.txt'), version: 1 },
  { _id: 'on-liberty-ch2', title: 'On Liberty — Of the Liberty of Thought and Discussion', author: 'John Stuart Mill', text: read('on-liberty-ch2.txt'), version: 1 },
  { _id: 'natural-selection', title: 'On the Origin of Species — Natural Selection', author: 'Charles Darwin', text: read('natural-selection.txt'), version: 1 },
]

/** Wipes and reseeds. Goes through the real write path so seq numbers/counters are genuine. */
export async function seed() {
  await Promise.all([annotations, counters, documents, groups, users, settings].map(c => c.deleteMany({})))
  await groups.insertMany(GROUPS)
  await users.insertMany(USERS)
  await documents.insertMany(DOCS.map(d => ({ ...d, wordCount: words(d.text) })))

  const [alice, bob, carol] = USERS as Student[]
  const quote = async (docId: string, phrase: string) => {
    const text = DOCS.find(d => d._id === docId)!.text
    const start = text.indexOf(phrase)
    if (start < 0) throw new Error(`seed phrase not found: ${phrase}`)
    return createAnchor(text, start, start + phrase.length)
  }

  const c1 = await createRoot(alice, 'civil-disobedience', {
    anchor: await quote('civil-disobedience', 'I think that we should be men first, and subjects afterward.'),
    body: 'This is the thesis of the whole essay: moral agency comes before civic obedience. Is that still defensible in a complex state?',
  })
  await createReply(bob, c1._id, 'I think so, but Thoreau skips over who decides what conscience demands.')
  await toggleUpvote(bob, c1._id)
  await createRoot(bob, 'civil-disobedience', {
    anchor: await quote('civil-disobedience', 'a corporation of conscientious men is a corporation _with_ a conscience'),
    body: 'Nice reversal of the "corporations have no conscience" line just before it.',
  })
  // Group B annotates the same document; Group A must never see these (and vice versa).
  await createRoot(carol, 'civil-disobedience', {
    anchor: await quote('civil-disobedience', 'I think that we should be men first, and subjects afterward.'),
    body: 'Group B here: we read this as a claim about individual duty rather than collective action.',
  })
  await createRoot(alice, 'on-liberty-ch2', {
    anchor: await quote('on-liberty-ch2', 'infallibility'),
    body: 'Mill’s core move: silencing an opinion presumes you cannot be wrong.',
  })
}

// `npm run seed` — reset the database to its initial state.
if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  await initDb()
  await seed()
  console.log('[seed] done')
  await mongo.close()
}
