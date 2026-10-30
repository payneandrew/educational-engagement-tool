import { serve } from '@hono/node-server'
import type { Server as HttpServer } from 'node:http'
import {
  io as connect,
  type Socket,
  type SocketOptions,
  type ManagerOptions,
} from 'socket.io-client'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { app } from '../app'
import { useTestDatabase } from '../test/database'
import type { ClientToServerEvents, ServerToClientEvents, Subscription } from './protocol'
import type { ReadingEvent } from './schema'
import { attachSocketServer } from './socket'

// A real HTTP server with Socket.IO attached, driven by the real client, against a throwaway MongoDB.
type Client = Socket<ServerToClientEvents, ClientToServerEvents>
type EventOfType<T extends ReadingEvent['type']> = Extract<ReadingEvent, { type: T }>

useTestDatabase()

let realtime: ReturnType<typeof attachSocketServer>
let url = ''
const clients: Client[] = []

const READING = 'civil-disobedience'
const OTHER_READING = 'on-liberty-ch2'
const here: Subscription = { type: 'reading', readingId: READING }
const dana = { id: 'u-dana', name: 'Prof. Dana Reyes' }
const alice = { id: 'u-alice', name: 'Alice Chen' }

/** Opens a socket as `userId`, the way the browser does. Fast reconnects keep the tests quick. */
function open(userId: string, options: Partial<ManagerOptions & SocketOptions> = {}): Client {
  const client: Client = connect(url, {
    transports: ['websocket'],
    auth: { userId },
    reconnectionDelay: 50,
    reconnectionDelayMax: 100,
    randomizationFactor: 0,
    ...options,
  })
  clients.push(client)
  return client
}

const connected = (client: Client) =>
  new Promise<void>((resolve, reject) => {
    if (client.connected) return resolve()
    client.once('connect', () => resolve())
    client.once('connect_error', reject)
  })

/** The next event of `type` on `client`. Register it before triggering the event. */
function next<T extends ReadingEvent['type']>(client: Client, type: T) {
  return new Promise<EventOfType<T>>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${type} event within 3s`)), 3000)
    const listener = (_readingId: string, event: ReadingEvent) => {
      if (event.type !== type) return
      clearTimeout(timer)
      client.off('reading:event', listener)
      resolve(event as EventOfType<T>)
    }
    client.on('reading:event', listener)
  })
}

/** Every event `client` receives from now on, in order. */
function record(client: Client) {
  const got: ReadingEvent[] = []
  client.on('reading:event', (_readingId, event) => got.push(event))
  return got
}

const send = async (method: string, path: string, userId: string, json?: unknown) =>
  app.request(`/api${path}`, {
    method,
    headers: { 'x-user-id': userId, 'content-type': 'application/json' },
    body: json === undefined ? undefined : JSON.stringify(json),
  })
const post = async (userId: string, body: string) =>
  (await (await send('POST', `/readings/${READING}/annotations`, userId, { body })).json()) as {
    id: string
  }

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      url = `http://localhost:${info.port}`
      resolve()
    })
    realtime = attachSocketServer(server as HttpServer)
  })
})

afterEach(() => {
  for (const client of clients.splice(0)) client.disconnect()
})

afterAll(async () => {
  await realtime.close()
})

describe('handshake', () => {
  it('refuses a connection that names no known user', async () => {
    await expect(connected(open('u-nobody'))).rejects.toThrow('unknown user')
    await expect(connected(open('', { auth: {} }))).rejects.toThrow('unknown user')
  })
})

describe('subscribe', () => {
  it('acknowledges a real reading and explains a refusal', async () => {
    const client = open('u-alice')
    await connected(client)
    expect(await client.emitWithAck('subscribe', here)).toEqual({ ok: true })
    expect(await client.emitWithAck('subscribe', { type: 'reading', readingId: 'nope' })).toEqual({
      ok: false,
      error: 'reading not found',
    })
    // Socket payloads are untrusted input, validated like request bodies.
    const malformed: unknown = { type: 'course' }
    expect(await client.emitWithAck('subscribe', malformed as never)).toEqual({
      ok: false,
      error: 'invalid subscription',
    })
  })
})

describe('fan-out', () => {
  it("pushes annotation changes and deletes to that reading's room only", async () => {
    const viewer = open('u-alice')
    const elsewhere = open('u-carol')
    await Promise.all([connected(viewer), connected(elsewhere)])
    await viewer.emitWithAck('subscribe', here)
    await elsewhere.emitWithAck('subscribe', { type: 'reading', readingId: OTHER_READING })
    const elsewhereGot = record(elsewhere)

    const created = next(viewer, 'annotation')
    const { id } = await post('u-bob', 'live from Bob')
    expect((await created).annotation).toMatchObject({
      id,
      body: 'live from Bob',
      authorName: 'Bob Okafor',
    })

    const updated = next(viewer, 'annotation')
    await send('PATCH', `/annotations/${id}`, 'u-bob', { body: 'edited by Bob' })
    expect((await updated).annotation).toMatchObject({ id, body: 'edited by Bob' })

    const deleted = next(viewer, 'deleted')
    await send('DELETE', `/annotations/${id}`, 'u-bob')
    expect(await deleted).toEqual({ type: 'deleted', id })

    expect(elsewhereGot.filter((event) => event.type !== 'viewers')).toEqual([])
  })

  it('stops after unsubscribe', async () => {
    const client = open('u-alice')
    await connected(client)
    await client.emitWithAck('subscribe', here)
    const got = record(client)
    client.emit('unsubscribe', here)
    // The server handles one socket's events in order, so once this ack is back, the unsubscribe is done.
    await client.emitWithAck('subscribe', { type: 'reading', readingId: OTHER_READING })
    await post('u-bob', 'nobody here is listening')
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(got.filter((event) => event.type === 'annotation')).toEqual([])
  })
})

describe('presence', () => {
  it('tells everyone on a reading who is here, counting each person once', async () => {
    const danasTab = open('u-dana')
    const alicesTab = open('u-alice')
    const alicesSecondTab = open('u-alice')
    await Promise.all([danasTab, alicesTab, alicesSecondTab].map(connected))

    let danaSees = next(danasTab, 'viewers')
    await danasTab.emitWithAck('subscribe', here)
    expect((await danaSees).viewers).toEqual([dana])

    danaSees = next(danasTab, 'viewers')
    await alicesTab.emitWithAck('subscribe', here)
    expect((await danaSees).viewers).toEqual([dana, alice])

    // A second tab of Alice's doesn't count her twice, and closing it doesn't remove her.
    danaSees = next(danasTab, 'viewers')
    await alicesSecondTab.emitWithAck('subscribe', here)
    expect((await danaSees).viewers).toEqual([dana, alice])
    danaSees = next(danasTab, 'viewers')
    alicesSecondTab.disconnect()
    expect((await danaSees).viewers).toEqual([dana, alice])

    danaSees = next(danasTab, 'viewers')
    alicesTab.disconnect()
    expect((await danaSees).viewers).toEqual([dana])
  })
})

describe('connection state recovery', () => {
  it('replays what a client missed during a short drop, without it subscribing again', async () => {
    // Reconnect after 500ms, so the post below definitely happens while it's disconnected.
    const client = open('u-alice', { reconnectionDelay: 500, reconnectionDelayMax: 500 })
    await connected(client)
    await client.emitWithAck('subscribe', here)

    const dropped = new Promise((resolve) => client.once('disconnect', resolve))
    client.io.engine.close() // what a network blip looks like to the client
    await dropped
    const { id } = await post('u-bob', 'posted while Alice was offline')

    const replayed = next(client, 'annotation')
    await connected(client)
    expect(client.recovered).toBe(true)
    expect((await replayed).annotation).toMatchObject({
      id,
      body: 'posted while Alice was offline',
    })
  })

  it('does not recover a deliberate disconnect (e.g. switching user): the client starts over', async () => {
    const client = open('u-alice')
    await connected(client)
    await client.emitWithAck('subscribe', here)
    client.disconnect()
    client.connect()
    await connected(client)
    expect(client.recovered).toBe(false)
  })
})
