import { MongoMemoryServer } from 'mongodb-memory-server'
import type { TestProject } from 'vitest/node'

/** One throwaway MongoDB for the whole test run. setup.ts gives each test file its own database on it. */
export default async function startTestMongo(project: TestProject) {
  const mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } })
  project.provide('mongoUri', mongod.getUri())
  return () => mongod.stop()
}

declare module 'vitest' {
  export interface ProvidedContext {
    mongoUri: string
  }
}
