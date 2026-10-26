import { serve } from '@hono/node-server'
import type { Server as HttpServer } from 'node:http'
import { app } from './app'
import { initDb, mongo, readings } from './db'
import { attachSocketServer } from './realtime/socket'
import { seedDemo } from './seed'

const port = Number(process.env.PORT ?? 3001)

await initDb()
if ((await readings.countDocuments()) === 0) {
  console.log('[api] empty database, seeding…')
  await seedDemo()
}

const server = serve({ fetch: app.fetch, port }, (info) =>
  console.log(`[api] listening on http://localhost:${info.port}`),
)
// Socket.IO shares the HTTP server (and port) with the REST API. serve() returns a plain HTTP server.
const realtime = attachSocketServer(server as HttpServer)

const shutdown = async () => {
  await realtime.close() // closes the HTTP server too
  await mongo.close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
