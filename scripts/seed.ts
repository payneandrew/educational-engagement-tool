// `npm run seed` resets the database to the demo data; `npm run seed -- --minimal` to the base seed only.
import { initDb, mongo } from '../server/src/db'
import { seed, seedDemo } from '../server/src/seed'

const minimal = process.argv.includes('--minimal')
await initDb()
await (minimal ? seed() : seedDemo())
console.log(`[seed] done (${minimal ? 'minimal' : 'demo'} data)`)
await mongo.close()
