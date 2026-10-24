import { HTTPException } from 'hono/http-exception'
import { ObjectId } from 'mongodb'
import { annotations, readings } from '../db'
import type { ReadingDoc, UserDoc } from '../models'

/** Wire shape for REST. Inferred types flow from here to the Vue app via Hono RPC. */
export type ReadingDTO = Omit<ReadingDoc, '_id' | 'createdAt'> & { id: string; createdAt: string }

export const toReadingDTO = ({ _id, createdAt, ...rest }: ReadingDoc): ReadingDTO => ({
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
      {
        $group: {
          _id: '$readingId',
          annotationCount: { $sum: 1 },
          authors: { $addToSet: '$authorId' },
        },
      },
      { $project: { annotationCount: 1, studentCount: { $size: '$authors' } } },
    ])
    .toArray()
  return new Map(rows.map(({ _id, ...stats }) => [_id, stats]))
}

/** Newest first, so a reading an instructor just assigned is at the top. Each carries its activity counts. */
export async function listReadings() {
  const [list, stats] = await Promise.all([
    readings.find().sort({ createdAt: -1 }).toArray(),
    statsByReading(),
  ])
  return list.map((d) => ({ ...toReadingDTO(d), ...(stats.get(d._id) ?? NO_ACTIVITY) }))
}

export async function getReading(id: string) {
  const d = await readings.findOne({ _id: id })
  if (!d) throw new HTTPException(404, { message: 'reading not found' })
  return toReadingDTO(d)
}

/** Callers must already have checked the user is an instructor (the route's `instructorOnly`). */
export async function createReading(
  instructor: UserDoc,
  input: { title: string; description: string },
) {
  const d: ReadingDoc = {
    _id: new ObjectId().toHexString(),
    title: input.title,
    description: input.description,
    createdBy: instructor._id,
    createdByName: instructor.name,
    createdAt: new Date(),
  }
  await readings.insertOne(d)
  return { ...toReadingDTO(d), ...NO_ACTIVITY } // same shape as a list entry, so the client can add it straight to the list
}
