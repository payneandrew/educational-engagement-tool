import { annotations, readings, users } from '../db'

/**
 * Every student's annotation count on every reading: the instructor's participation dashboard.
 *
 * Students come from `users`, not from the annotations, so a student who hasn't posted anywhere still
 * gets a row (of zeros). Those are the students an instructor most needs to see.
 */
export async function participation() {
  const [students, readingList, counts] = await Promise.all([
    users.find({ role: 'student' }).sort({ name: 1 }).toArray(),
    // Oldest first, like a gradebook: columns read in the order the readings were assigned.
    readings.find().sort({ createdAt: 1 }).toArray(),
    annotations
      .aggregate<{ _id: { readingId: string; authorId: string }; count: number }>([
        { $group: { _id: { readingId: '$readingId', authorId: '$authorId' }, count: { $sum: 1 } } },
      ])
      .toArray(),
  ])

  const countOf = new Map(
    counts.map(({ _id, count }) => [`${_id.authorId}|${_id.readingId}`, count]),
  )

  return {
    readings: readingList.map((reading) => ({ id: reading._id, title: reading.title })),
    students: students.map((student) => {
      /** Annotations (replies included) per reading, in the same order as `readings`. */
      const perReading = readingList.map(
        (reading) => countOf.get(`${student._id}|${reading._id}`) ?? 0,
      )
      return {
        id: student._id,
        name: student.name,
        perReading,
        total: perReading.reduce((sum, count) => sum + count, 0),
        readingsParticipated: perReading.filter((count) => count > 0).length,
      }
    }),
  }
}
