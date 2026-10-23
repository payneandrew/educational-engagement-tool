import { ObjectId } from 'mongodb'
import { documents } from '../db'
import type { DocumentDoc, UserDoc } from '../models'
import { AppError } from './errors'

/** Wire shape for REST. Inferred types flow from here to the Vue app via Hono RPC. */
export type ReadingDTO = Omit<DocumentDoc, '_id' | 'createdAt'> & { id: string; createdAt: string }

export const toReadingDTO = ({ _id, createdAt, ...rest }: DocumentDoc): ReadingDTO => ({
  id: _id,
  createdAt: createdAt.toISOString(),
  ...rest,
})

/** Newest first, so a reading an instructor just assigned is at the top. */
export const listReadings = async () => (await documents.find().sort({ createdAt: -1 }).toArray()).map(toReadingDTO)

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
  return toReadingDTO(d)
}
