import { randomUUID } from 'node:crypto'
import { inject } from 'vitest'

// Runs before each test file is loaded, so it's in place before anything imports db.ts (which reads
// these once). Every file gets its own database, so files running in parallel can't interfere.
process.env.MONGO_URI = inject('mongoUri')
process.env.MONGO_DB = `test-${randomUUID()}`
