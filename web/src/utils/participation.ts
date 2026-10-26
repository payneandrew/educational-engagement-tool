import type { Participation } from '@/api/client'
import { oneDecimal } from './format'

const mean = (values: number[]): number =>
  values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0

export interface ClassAverage {
  /** In the same order as the readings. */
  perReading: number[]
  total: number
  readingsParticipated: number
}

/**
 * The class average row: the mean per student, counting students who haven't posted (their zeros are
 * the point). Nothing to average gives zeros, not NaN.
 */
export function classAverage({ readings, students }: Participation): ClassAverage {
  return {
    perReading: readings.map((_, index) =>
      mean(students.map((student) => student.perReading[index] ?? 0)),
    ),
    total: mean(students.map((student) => student.total)),
    readingsParticipated: mean(students.map((student) => student.readingsParticipated)),
  }
}

/**
 * The participation table as rows for a CSV: the same columns and numbers as the page (students in the
 * order given, then the class average rounded the way the page shows it), so the file never disagrees
 * with the screen.
 */
export function participationRows(data: Participation): (string | number)[][] {
  const average = classAverage(data)
  return [
    ['Student', 'Total', 'Readings participated', ...data.readings.map((reading) => reading.title)],
    ...data.students.map((student) => [
      student.name,
      student.total,
      student.readingsParticipated,
      ...student.perReading,
    ]),
    [
      'Class average',
      ...[average.total, average.readingsParticipated, ...average.perReading].map((value) =>
        Number(oneDecimal(value)),
      ),
    ],
  ]
}
