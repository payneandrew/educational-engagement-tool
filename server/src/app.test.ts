import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Exercises the HTTP layer (auth + role middleware + validation) via app.request, no server socket needed.
// Live updates (Socket.IO) are tested in realtime/socket.test.ts.
let mongod: MongoMemoryServer
let modules: { app: (typeof import('./app'))['app']; db: typeof import('./db') }

// async: app.request() is typed `Response | Promise<Response>`; this always returns a Promise.
const send = async (method: string, path: string, userId: string, json?: unknown) =>
  modules.app.request(`/api${path}`, {
    method,
    headers: { 'x-user-id': userId, 'content-type': 'application/json' },
    body: json === undefined ? undefined : JSON.stringify(json),
  })
const post = (userId: string, json: unknown) => send('POST', '/readings', userId, json)

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  process.env.MONGO_URI = mongod.getUri()
  modules = { app: (await import('./app')).app, db: await import('./db') }
  await modules.db.initDb()
  await (await import('./seed')).seed()
}, 120_000)

afterAll(async () => {
  await modules.db.mongo.close()
  await mongod.stop()
})

describe('GET /readings', () => {
  it('includes each reading’s annotation count (replies included) and unique students', async () => {
    const list: { id: string; annotationCount: number; studentCount: number }[] = await (
      await modules.app.request('/api/readings', { headers: { 'x-user-id': 'u-dana' } })
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
    await modules.db.users.insertOne({ _id: 'u-quiet', name: 'Quinn Park', role: 'student' })

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

    await modules.db.users.deleteOne({ _id: 'u-quiet' })
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
      await modules.app.request('/api/readings', { headers: { 'x-user-id': 'u-alice' } })
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

  it('rejects an empty annotation and a reading that does not exist', async () => {
    const empty = await send('POST', `/readings/${READING}/annotations`, 'u-alice', { body: '  ' })
    expect(empty.status).toBe(400)
    expect((await empty.json()).error).toContain('annotation cannot be empty')

    const missing = await send('POST', '/readings/nope/annotations', 'u-alice', { body: 'hello' })
    expect(missing.status).toBe(404)
  })
})
