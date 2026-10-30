import { HTTPException } from 'hono/http-exception'
import { ObjectId } from 'mongodb'
import { annotations, readings } from '../db'
import type { ReadingDoc, UserDoc } from '../db/models'
import type { CreateReadingInput } from '../schemas'

/** Wire shape for REST. */
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
export type ReadingListItemDTO = ReadingDTO & ReadingStats

const NO_ACTIVITY: ReadingStats = { annotationCount: 0, studentCount: 0 }

/** Counts per reading in one aggregation; readings with no annotations are absent. */
async function statsByReading(): Promise<Map<string, ReadingStats>> {
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

/** Newest first, each with its activity counts. */
export async function listReadings(): Promise<ReadingListItemDTO[]> {
  const [list, stats] = await Promise.all([
    readings.find().sort({ createdAt: -1 }).toArray(),
    statsByReading(),
  ])
  return list.map((reading) => ({
    ...toReadingDTO(reading),
    ...(stats.get(reading._id) ?? NO_ACTIVITY),
  }))
}

export async function getReading(id: string): Promise<ReadingDTO> {
  const reading = await readings.findOne({ _id: id })
  if (!reading) throw new HTTPException(404, { message: 'reading not found' })
  return toReadingDTO(reading)
}

export async function createReading(
  instructor: UserDoc,
  input: CreateReadingInput,
): Promise<ReadingListItemDTO> {
  const reading: ReadingDoc = {
    _id: new ObjectId().toHexString(),
    title: input.title,
    description: input.description,
    createdBy: instructor._id,
    createdByName: instructor.name,
    createdAt: new Date(),
  }
  await readings.insertOne(reading)
  return { ...toReadingDTO(reading), ...NO_ACTIVITY } // same shape as a list entry
}
