import { describe, expect, it, vi } from 'vitest'
import { app } from './app'
import { annotations, users } from './db'
import { useTestDatabase } from './test/database'

// Exercises the HTTP layer (auth + role middleware + validation) via app.request, no server socket needed.
useTestDatabase()

// async: app.request() is typed `Response | Promise<Response>`; this always returns a Promise.
const send = async (method: string, path: string, userId: string, json?: unknown) =>
  app.request(`/api${path}`, {
    method,
    headers: { 'x-user-id': userId, 'content-type': 'application/json' },
    body: json === undefined ? undefined : JSON.stringify(json),
  })
const post = (userId: string, json: unknown) => send('POST', '/readings', userId, json)

describe('GET /readings', () => {
  it('includes each reading’s annotation count (replies included) and unique students', async () => {
    const list: { id: string; annotationCount: number; studentCount: number }[] = await (
      await app.request('/api/readings', { headers: { 'x-user-id': 'u-dana' } })
    ).json()
    const stats = (id: string) => {
      const { annotationCount, studentCount } = list.find((reading) => reading.id === id)!
      return { annotationCount, studentCount }
    }
    // Seed: Alice's comment with replies from Bob and Carol, plus a comment from Bob.
    expect(stats('civil-disobedience')).toEqual({ annotationCount: 4, studentCount: 3 })
    expect(stats('on-liberty-ch2')).toEqual({ annotationCount: 1, studentCount: 1 })
    expect(stats('natural-selection')).toEqual({ annotationCount: 0, studentCount: 0 }) // no annotations yet
  })
})

// Runs against the plain seed data, before the tests below add annotations.
describe('GET /participation', () => {
  it('counts every student on every reading, including students who have not posted', async () => {
    await users.insertOne({ _id: 'u-quiet', name: 'Quinn Park', role: 'student' })

    const res = await send('GET', '/participation', 'u-dana')
    expect(res.status).toBe(200)
    const { readings, students } = await res.json()

    // Oldest first: the order the readings were assigned.
    expect(readings.map((reading: { id: string }) => reading.id)).toEqual([
      'civil-disobedience',
      'on-liberty-ch2',
      'natural-selection',
    ])
    // Students only (not the instructor), sorted by name.
    expect(students).toEqual([
      {
        id: 'u-alice',
        name: 'Alice Chen',
        perReading: [1, 1, 0],
        total: 2,
        readingsParticipated: 2,
      },
      { id: 'u-bob', name: 'Bob Okafor', perReading: [2, 0, 0], total: 2, readingsParticipated: 1 },
      {
        id: 'u-carol',
        name: 'Carol Silva',
        perReading: [1, 0, 0],
        total: 1,
        readingsParticipated: 1,
      },
      {
        id: 'u-quiet',
        name: 'Quinn Park',
        perReading: [0, 0, 0],
        total: 0,
        readingsParticipated: 0,
      },
    ])

    await users.deleteOne({ _id: 'u-quiet' })
  })

  it('is for instructors only', async () => {
    const res = await send('GET', '/participation', 'u-alice')
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'only instructors can do this' })
  })
})

describe('POST /readings', () => {
  it('lets an instructor create a reading, which then lists first', async () => {
    const res = await post('u-dana', {
      title: '  Plato — Apology  ',
      description: 'Read the whole dialogue.',
    })
    expect(res.status).toBe(201)
    const created = await res.json()
    expect(created).toMatchObject({
      title: 'Plato — Apology',
      description: 'Read the whole dialogue.',
      createdBy: 'u-dana',
      createdByName: 'Prof. Dana Reyes',
    })
    expect(Date.parse(created.createdAt)).not.toBeNaN()

    const list = await (
      await app.request('/api/readings', { headers: { 'x-user-id': 'u-alice' } })
    ).json()
    expect(list[0].id).toBe(created.id)
  })

  it('rejects students', async () => {
    const res = await post('u-alice', { title: 'Sneaky', description: 'Not allowed.' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'only instructors can do this' })
  })

  it('rejects unknown users', async () => {
    expect((await post('u-nobody', { title: 'x', description: 'y' })).status).toBe(401)
  })

  it('requires a non-blank title and description', async () => {
    const res = await post('u-dana', { title: '   ', description: '' })
    expect(res.status).toBe(400)
    const { error } = await res.json()
    expect(error).toContain('title is required')
    expect(error).toContain('description is required')
  })
})

describe('unexpected errors', () => {
  it('answer with a generic 500 that never exposes internal details', async () => {
    const failure = vi.spyOn(annotations, 'find').mockImplementation(() => {
      throw new Error('connection pool exhausted at db-7.internal')
    })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await send('GET', '/readings/natural-selection/annotations', 'u-alice')
      expect(res.status).toBe(500)
      // The same { error } shape as every other failure, so the client can always show it.
      expect(await res.json()).toEqual({
        error: 'Something went wrong on the server. Please try again.',
      })
      expect(log).toHaveBeenCalled() // the details go to the server log instead
    } finally {
      failure.mockRestore()
      log.mockRestore()
    }
  })
})

describe('annotation routes', () => {
  const READING = 'natural-selection' // no seeded annotations

  it('lets a student post (trimmed), and anyone read it back', async () => {
    const res = await send('POST', `/readings/${READING}/annotations`, 'u-alice', {
      body: '  hi  ',
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toMatchObject({ body: 'hi', authorName: 'Alice Chen', kind: 'root' })

    const list = await (await send('GET', `/readings/${READING}/annotations`, 'u-dana')).json()
    expect(list.map((annotation: { body: string }) => annotation.body)).toContain('hi')
  })

  it('rejects instructors on every annotation write', async () => {
    const root = await (
      await send('POST', `/readings/${READING}/annotations`, 'u-bob', { body: 'mine' })
    ).json()
    const writes = [
      send('POST', `/readings/${READING}/annotations`, 'u-dana', { body: 'x' }),
      send('POST', `/annotations/${root.id}/replies`, 'u-dana', { body: 'x' }),
      send('PATCH', `/annotations/${root.id}`, 'u-dana', { body: 'x' }),
      send('DELETE', `/annotations/${root.id}`, 'u-dana'),
    ]
    for (const res of await Promise.all(writes)) {
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'only students can post annotations' })
    }
  })

  it('limits annotations to 5,000 characters, and validates edits like new posts', async () => {
    const longest = 'x'.repeat(5000)
    const created = await send('POST', `/readings/${READING}/annotations`, 'u-alice', {
      body: longest,
    })
    expect(created.status).toBe(201)
    const { id } = await created.json()

    const tooLong = { body: `${longest}x` }
    const rejected = [
      await send('POST', `/readings/${READING}/annotations`, 'u-alice', tooLong),
      await send('PATCH', `/annotations/${id}`, 'u-alice', tooLong),
      await send('PATCH', `/annotations/${id}`, 'u-alice', { body: '   ' }),
    ]
    for (const res of rejected) {
      expect(res.status).toBe(400)
      expect((await res.json()).error).toMatch(/^body: /) // names the field, for the UI to show
    }
  })

  it('rejects an empty annotation and a reading that does not exist', async () => {
    const empty = await send('POST', `/readings/${READING}/annotations`, 'u-alice', { body: '  ' })
    expect(empty.status).toBe(400)
    expect((await empty.json()).error).toContain('annotation cannot be empty')

    const missing = await send('POST', '/readings/nope/annotations', 'u-alice', { body: 'hello' })
    expect(missing.status).toBe(404)

    const badId = await send('POST', `/readings/${READING}/annotations`, 'u-alice', {
      body: 'hello',
      id: 'not-an-id',
    })
    expect(badId.status).toBe(400)
    expect((await badId.json()).error).toContain('id must be 24 hexadecimal characters')
  })
})

/** Opens a reading's live stream as `userId`, the way a browser would. */
async function openStream(readingId: string, userId: string) {
  const res = await app.request(`/api/readings/${readingId}/stream`, {
    headers: { 'x-user-id': userId },
  })
  const reader = res.body!.getReader()
  const next = async () => new TextDecoder().decode((await reader.read()).value)
  return {
    res,
    next,
    /** The next event's data, skipping heartbeat comments. */
    async nextEvent() {
      for (;;) {
        const chunk = await next()
        if (chunk.startsWith('data: ')) return JSON.parse(chunk.slice('data: '.length))
      }
    },
    // A browser disconnecting reaches the route as the response body being cancelled.
    close: () => reader.cancel(),
  }
}

const dana = { id: 'u-dana', name: 'Prof. Dana Reyes' }
const alice = { id: 'u-alice', name: 'Alice Chen' }

describe('GET /readings/:id/stream', () => {
  it('opens immediately and pushes new annotations while connected', async () => {
    const READING = 'on-liberty-ch2'
    const stream = await openStream(READING, 'u-dana')
    expect(stream.res.headers.get('content-type')).toBe('text/event-stream')
    expect(await stream.next()).toBe('retry: 3000\n\n') // sent before any event, so the stream opens
    expect(await stream.nextEvent()).toEqual({ type: 'viewers', viewers: [dana] })

    await send('POST', `/readings/${READING}/annotations`, 'u-alice', { body: 'live!' })
    expect(await stream.nextEvent()).toMatchObject({
      type: 'annotation',
      annotation: { body: 'live!', authorName: 'Alice Chen' },
    })
    await stream.close()
  })

  it('sends a heartbeat comment while the stream is quiet', async () => {
    const stream = await openStream('natural-selection', 'u-dana')
    expect(await stream.next()).toBe('retry: 3000\n\n')
    await stream.nextEvent() // the viewer list
    expect(await stream.next()).toBe(': ping\n\n') // HEARTBEAT_MS is 100 ms in these tests
    await stream.close()
  })

  it('tells everyone on a reading who is here as people arrive and leave', async () => {
    const READING = 'civil-disobedience'
    const danasTab = await openStream(READING, 'u-dana')
    expect(await danasTab.nextEvent()).toEqual({ type: 'viewers', viewers: [dana] })

    const alicesTab = await openStream(READING, 'u-alice')
    expect(await alicesTab.nextEvent()).toEqual({ type: 'viewers', viewers: [dana, alice] })
    expect(await danasTab.nextEvent()).toEqual({ type: 'viewers', viewers: [dana, alice] })

    // A second tab of Alice's doesn't count her twice, and closing it doesn't remove her.
    const alicesSecondTab = await openStream(READING, 'u-alice')
    expect(await danasTab.nextEvent()).toEqual({ type: 'viewers', viewers: [dana, alice] })
    await alicesSecondTab.close()
    expect(await danasTab.nextEvent()).toEqual({ type: 'viewers', viewers: [dana, alice] })

    await alicesTab.close()
    expect(await danasTab.nextEvent()).toEqual({ type: 'viewers', viewers: [dana] })
    await danasTab.close()
  })
})
