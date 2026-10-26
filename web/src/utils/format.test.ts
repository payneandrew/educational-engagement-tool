import { describe, expect, it } from 'vitest'
import { initials, relativeTime } from './format'

describe('relativeTime', () => {
  const now = Date.parse('2026-10-26T15:00:00Z')
  const ago = (ms: number) => new Date(now - ms).toISOString()

  it('reads naturally for recent posts', () => {
    expect(relativeTime(ago(20_000), now)).toBe('just now')
    expect(relativeTime(ago(5 * 60_000), now)).toBe('5 minutes ago')
    expect(relativeTime(ago(3 * 3_600_000), now)).toBe('3 hours ago')
    expect(relativeTime(ago(26 * 3_600_000), now)).toBe('yesterday')
    expect(relativeTime(ago(3 * 86_400_000), now)).toBe('3 days ago')
  })

  it('falls back to the date after a week, adding the year only when it differs', () => {
    expect(relativeTime('2026-09-04T14:00:00Z', now)).toBe('Sep 4')
    expect(relativeTime('2025-09-04T14:00:00Z', now)).toBe('Sep 4, 2025')
  })
})

describe('initials', () => {
  it('uses the first and last name and skips titles', () => {
    expect(initials('Alice Chen')).toBe('AC')
    expect(initials('Prof. Dana Reyes')).toBe('DR')
    expect(initials('Émile Durkheim')).toBe('ÉD')
    expect(initials('Plato')).toBe('P')
  })
})
