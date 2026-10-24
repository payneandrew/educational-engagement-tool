import { MongoClient } from 'mongodb'
import type { AnnotationDoc, DocumentDoc, UserDoc } from './models'

export const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://127.0.0.1:27018'
export const mongo = new MongoClient(MONGO_URI)
export const db = mongo.db(process.env.MONGO_DB ?? 'annotate')

// Collection handles are lazy, so they can be module-level constants.
export const users = db.collection<UserDoc>('users')
export const documents = db.collection<DocumentDoc>('documents')
export const annotations = db.collection<AnnotationDoc>('annotations')

export async function initDb() {
  await mongo.connect()
  await createIndexes()
}

export async function createIndexes() {
  // Serves loading a reading's discussion (newest first) and the reading list's newest-first sort.
  await annotations.createIndex({ documentId: 1, createdAt: -1 })
  // Serves deleting a root together with its replies.
  await annotations.createIndex({ parentId: 1 }, { sparse: true })
  await documents.createIndex({ createdAt: -1 })
}
