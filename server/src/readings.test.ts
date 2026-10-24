import { MongoMemoryServer } from 'mongodb-memory-server'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Exercises the HTTP layer (auth + role middleware + validation) via app.request, no server socket needed.
let mongod: MongoMemoryServer
let m: { app: typeof import('./app')['app']; db: typeof import('./db') }

const post = (userId: string, json: unknown) =>
  m.app.request('/api/readings', { method: 'POST', headers: { 'x-user-id': userId, 'content-type': 'application/json' }, body: JSON.stringify(json) })

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

describe('POST /readings', () => {
  it('lets an instructor create a reading, which then lists first', async () => {
    const res = await post('u-dana', { title: '  Plato — Apology  ', description: 'Read the whole dialogue.' })
    expect(res.status).toBe(201)
    const created = await res.json()
    expect(created).toMatchObject({ title: 'Plato — Apology', description: 'Read the whole dialogue.', createdBy: 'u-dana' })
    expect(Date.parse(created.createdAt)).not.toBeNaN()

    const list = await (await m.app.request('/api/readings', { headers: { 'x-user-id': 'u-alice' } })).json()
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
