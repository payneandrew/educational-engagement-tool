import { serve } from '@hono/node-server'
import { app } from './app'
import { documents, initDb, mongo } from './db'
import { seed } from './seed'

const port = Number(process.env.PORT ?? 3001)

await initDb()
if ((await documents.countDocuments()) === 0) {
  console.log('[api] empty database, seeding…')
  await seed()
}

const server = serve({ fetch: app.fetch, port }, (i) =>
  console.log(`[api] listening on http://localhost:${i.port}`),
)

const shutdown = async () => {
  server.close()
  await mongo.close()
  process.exit(0)
}
process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
