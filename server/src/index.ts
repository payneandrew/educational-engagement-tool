import { serve } from '@hono/node-server'
import { app } from './app'
import { initDb, mongo, readings } from './db'
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

const shutdown = async () => {
  server.close()
  await mongo.close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
