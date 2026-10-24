import { ObjectId } from 'mongodb'
import { annotations, documents } from '../db'
import type { DocumentDoc, UserDoc } from '../models'
import { AppError } from './errors'

/** Wire shape for REST. Inferred types flow from here to the Vue app via Hono RPC. */
export type ReadingDTO = Omit<DocumentDoc, '_id' | 'createdAt'> & { id: string; createdAt: string }

export const toReadingDTO = ({ _id, createdAt, ...rest }: DocumentDoc): ReadingDTO => ({
  id: _id,
  createdAt: createdAt.toISOString(),
  ...rest,
})

export interface ReadingStats {
  /** Top-level annotations plus replies. */
  annotationCount: number
  /** Distinct authors. Only students can post, so this is the number of students participating. */
  studentCount: number
}
const NO_ACTIVITY: ReadingStats = { annotationCount: 0, studentCount: 0 }

/** One pass over the annotations, grouped by reading. Readings nobody has annotated don't appear. */
async function statsByReading() {
  const rows = await annotations
    .aggregate<ReadingStats & { _id: string }>([
      { $group: { _id: '$documentId', annotationCount: { $sum: 1 }, authors: { $addToSet: '$authorId' } } },
      { $project: { annotationCount: 1, studentCount: { $size: '$authors' } } },
    ])
    .toArray()
  return new Map(rows.map(({ _id, ...stats }) => [_id, stats]))
}

/** Newest first, so a reading an instructor just assigned is at the top. Each carries its activity counts. */
export async function listReadings() {
  const [docs, stats] = await Promise.all([documents.find().sort({ createdAt: -1 }).toArray(), statsByReading()])
  return docs.map(d => ({ ...toReadingDTO(d), ...(stats.get(d._id) ?? NO_ACTIVITY) }))
}

export async function getReading(id: string) {
  const d = await documents.findOne({ _id: id })
  if (!d) throw new AppError(404, 'reading not found')
  return toReadingDTO(d)
}

/** Callers must already have checked the user is an instructor (the route's `instructorOnly`). */
export async function createReading(instructor: UserDoc, input: { title: string; description: string }) {
  const d: DocumentDoc = {
    _id: new ObjectId().toHexString(),
    title: input.title,
    description: input.description,
    createdBy: instructor._id,
    createdAt: new Date(),
  }
  await documents.insertOne(d)
  return { ...toReadingDTO(d), ...NO_ACTIVITY } // same shape as a list entry, so the client can add it straight to the list
}
