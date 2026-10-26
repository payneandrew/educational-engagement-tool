import { afterAll, beforeAll } from 'vitest'
import { db, initDb, mongo } from '../db'
import { seed } from '../seed'

/** For a test file that uses the database: connects and loads the base seed first, deletes it all after. */
export function useTestDatabase() {
  beforeAll(async () => {
    await initDb()
    await seed()
  })
  afterAll(async () => {
    await db.dropDatabase()
    await mongo.close()
  })
}
