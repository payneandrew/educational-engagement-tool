import { execFileSync } from 'node:child_process'

// Start every run from the seeded state. Needs the dev DB up, so we wait for the stack first.
export default async function globalSetup() {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch('http://localhost:5173/api/health')).ok) break } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 1000))
  }
  execFileSync('npx', ['tsx', 'server/src/seed.ts'], { stdio: 'inherit' })
}
