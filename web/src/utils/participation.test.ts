import { describe, expect, it } from 'vitest'
import type { Participation } from '@/api/client'
import { classAverage, participationRows } from './participation'

const data: Participation = {
  readings: [
    { id: 'r1', title: 'Plato, Apology' },
    { id: 'r2', title: 'Mill — On Liberty' },
  ],
  students: [
    { id: 'a', name: 'Ana', perReading: [3, 1], total: 4, readingsParticipated: 2 },
    { id: 'b', name: 'Ben', perReading: [0, 1], total: 1, readingsParticipated: 1 },
    { id: 'q', name: 'Quinn', perReading: [0, 0], total: 0, readingsParticipated: 0 },
  ],
}

describe('classAverage', () => {
  it('is the mean per student, and students who have not posted count as zeros', () => {
    expect(classAverage(data)).toEqual({
      perReading: [1, 2 / 3],
      total: 5 / 3,
      readingsParticipated: 1,
    })
  })

  it('gives zeros, not NaN, when there is nobody to average', () => {
    expect(classAverage({ readings: data.readings, students: [] })).toEqual({
      perReading: [0, 0],
      total: 0,
      readingsParticipated: 0,
    })
  })
})

describe('participationRows', () => {
  it('has the same columns and numbers as the table, and ends with the class average as shown', () => {
    expect(participationRows(data)).toEqual([
      ['Student', 'Total', 'Readings participated', 'Plato, Apology', 'Mill — On Liberty'],
      ['Ana', 4, 2, 3, 1],
      ['Ben', 1, 1, 0, 1],
      ['Quinn', 0, 0, 0, 0],
      ['Class average', 1.7, 1, 1, 0.7], // 5/3 and 2/3 rounded to one decimal, like the footer
    ])
  })

  it('has one column per reading in every row', () => {
    const widths = new Set(participationRows(data).map((row) => row.length))
    expect(widths).toEqual(new Set([3 + data.readings.length]))
  })
})
