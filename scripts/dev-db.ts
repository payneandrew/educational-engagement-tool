// Dev-only MongoDB: a persistent single-node replica set (change streams and
// transactions both require a replica set, even with one member).
// Override with MONGO_URI to use your own cluster instead (then skip this script).
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const PORT = 27018
const dbPath = resolve('.data/mongo')
mkdirSync(dbPath, { recursive: true })

const rs = await MongoMemoryReplSet.create({
  binary: { version: '7.0.14' },
  replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: PORT, dbPath, storageEngine: 'wiredTiger' }],
})
console.log(`[db] replica set ready: ${rs.getUri()}`)

const stop = async () => { await rs.stop({ doCleanup: false }); process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
