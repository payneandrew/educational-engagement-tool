// Dev-only MongoDB: a persistent local mongod, downloaded and run by mongodb-memory-server so there's
// nothing to install. Override with MONGO_URI to use your own server instead (then skip this script).
import { MongoMemoryServer } from 'mongodb-memory-server'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const PORT = 27018
const dbPath = resolve('.data/db')
mkdirSync(dbPath, { recursive: true })

const server = await MongoMemoryServer.create({
  binary: { version: '7.0.14' },
  instance: { port: PORT, dbPath, storageEngine: 'wiredTiger' },
})
console.log(`[db] ready: ${server.getUri()}`)

const stop = async () => { await server.stop({ doCleanup: false }); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
