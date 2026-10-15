import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts', // not *.test.ts / *.spec.ts, so vitest doesn't pick these up
  workers: 1,
  timeout: 60_000,
  globalSetup: './e2e/reset-db.ts',
  use: { baseURL: 'http://localhost:5173', trace: 'retain-on-failure' },
  // Reuses a running `npm run dev`, otherwise starts one.
  webServer: { command: 'npm run dev', url: 'http://localhost:5173/api/health', reuseExistingServer: true, timeout: 120_000 },
})
