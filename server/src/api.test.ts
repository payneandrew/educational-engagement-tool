import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Exercises the HTTP layer (auth + role middleware + validation) via app.request, no server socket needed.
let mongod: MongoMemoryServer
let m: { app: (typeof import('./app'))['app']; db: typeof import('./db') }

// async: app.request() is typed `Response | Promise<Response>`; this always returns a Promise.
const send = async (method: string, path: string, userId: string, json?: unknown) =>
  m.app.request(`/api${path}`, {
    method,
    headers: { 'x-user-id': userId, 'content-type': 'application/json' },
    body: json === undefined ? undefined : JSON.stringify(json),
  })
const post = (userId: string, json: unknown) => send('POST', '/readings', userId, json)

beforeAll(async () => {
  mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  process.env.MONGO_URI = mongod.getUri()
  m = { app: (await import('./app')).app, db: await import('./db') }
  await m.db.initDb()
  await (await import('./seed')).seed()
}, 120_000)

afterAll(async () => {
  await m.db.mongo.close()
  await mongod.stop()
})

describe('GET /readings', () => {
  it('includes each reading’s annotation count (replies included) and unique students', async () => {
    const list: { id: string; annotationCount: number; studentCount: number }[] = await (
      await m.app.request('/api/readings', { headers: { 'x-user-id': 'u-dana' } })
    ).json()
    const stats = (id: string) => {
      const { annotationCount, studentCount } = list.find((r) => r.id === id)!
      return { annotationCount, studentCount }
    }
    // Seed: Alice's comment with replies from Bob and Carol, plus a comment from Bob.
    expect(stats('civil-disobedience')).toEqual({ annotationCount: 4, studentCount: 3 })
    expect(stats('on-liberty-ch2')).toEqual({ annotationCount: 1, studentCount: 1 })
    expect(stats('natural-selection')).toEqual({ annotationCount: 0, studentCount: 0 }) // no annotations yet
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
      await m.app.request('/api/readings', { headers: { 'x-user-id': 'u-alice' } })
    ).json()
    expect(list[0].id).toBe(created.id)
  })

  it('rejects students', async () => {
    const res = await post('u-alice', { title: 'Sneaky', description: 'Not allowed.' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'only instructors can create readings' })
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
    expect(list.map((a: { body: string }) => a.body)).toContain('hi')
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

describe('GET /readings/:id/stream', () => {
  it('opens immediately and pushes new annotations while connected', async () => {
    const READING = 'on-liberty-ch2'
    const res = await m.app.request(`/api/readings/${READING}/stream`, {
      headers: { 'x-user-id': 'u-dana' },
    })
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    const reader = res.body!.getReader()
    const next = async () => new TextDecoder().decode((await reader.read()).value)

    expect(await next()).toBe('retry: 3000\n\n') // sent before any event, so the stream opens

    await send('POST', `/readings/${READING}/annotations`, 'u-alice', { body: 'live!' })
    const message = await next()
    expect(message).toMatch(/^event: annotation\n/)
    expect(message).toContain('"body":"live!"')

    // A browser disconnecting reaches the route as the response body being cancelled.
    await reader.cancel()
  })
})
