import { MongoClient } from 'mongodb'
import type { AnnotationDoc, CounterDoc, DocumentDoc, GroupDoc, SettingDoc, UserDoc } from './models'

export const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018/?replicaSet=rs0'
export const mongo = new MongoClient(MONGO_URI)
export const db = mongo.db(process.env.MONGO_DB ?? 'annotate')

// Collection handles are lazy, so they can be module-level constants.
export const groups = db.collection<GroupDoc>('groups')
export const users = db.collection<UserDoc>('users')
export const documents = db.collection<DocumentDoc>('documents')
export const annotations = db.collection<AnnotationDoc>('annotations')
export const counters = db.collection<CounterDoc>('channel_counters')
export const settings = db.collection<SettingDoc>('settings')

export async function initDb() {
  await mongo.connect()
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name))
  // Create up-front: collections can't be implicitly created inside some transaction paths,
  // and we want post-images on annotations so each change event carries the doc exactly as
  // of THAT write (not as of whenever the lookup happens to run).
  if (!existing.has('annotations')) await db.createCollection('annotations', { changeStreamPreAndPostImages: { enabled: true } })
  else await db.command({ collMod: 'annotations', changeStreamPreAndPostImages: { enabled: true } })
  if (!existing.has('channel_counters')) await db.createCollection('channel_counters')

  // Serves listing, replay (seq > N), and uniqueness of seq within a channel.
  await annotations.createIndex({ documentId: 1, groupId: 1, seq: 1 }, { unique: true })
  // Serves the instructor scoring read (all annotations for a document, any group).
  await annotations.createIndex({ documentId: 1, authorId: 1 })
  await annotations.createIndex({ parentId: 1 }, { sparse: true })
}
