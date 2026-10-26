import { describe, expect, it } from 'vitest'
import { parseReadingEvent, type ReadingEvent } from './schema'

const annotation = {
  id: 'a1',
  readingId: 'r1',
  kind: 'root',
  parentId: null,
  authorId: 'u1',
  authorName: 'Alice Chen',
  body: 'hello',
  createdAt: '2026-09-04T14:00:00.000Z',
  editedAt: null,
} as const

const parse = (value: unknown) => parseReadingEvent(JSON.stringify(value))

describe('parseReadingEvent', () => {
  it('reads every kind of event the server sends', () => {
    const events: ReadingEvent[] = [
      { type: 'annotation', annotation },
      { type: 'deleted', id: 'a1' },
      { type: 'viewers', viewers: [{ id: 'u1', name: 'Alice Chen' }] },
    ]
    for (const event of events) expect(parse(event)).toEqual(event)
  })

  it('drops anything else instead of trusting it', () => {
    expect(parseReadingEvent('not json')).toBeUndefined()
    expect(parse({ type: 'unknown' })).toBeUndefined()
    expect(parse({ type: 'deleted' })).toBeUndefined()
    expect(
      parse({ type: 'annotation', annotation: { ...annotation, kind: 'other' } }),
    ).toBeUndefined()
  })
})
