import { describe, expect, it } from 'vitest'
import { titleMatches } from './search'

describe('titleMatches', () => {
  const title = 'Thoreau — On the Duty of Civil Disobedience'

  it('matches any part of the title, ignoring case and surrounding spaces', () => {
    expect(titleMatches(title, 'thoreau')).toBe(true)
    expect(titleMatches(title, '  CIVIL disob ')).toBe(true)
    expect(titleMatches(title, 'Mill')).toBe(false)
  })

  it('ignores accents on either side', () => {
    expect(titleMatches('Déjà vu', 'deja')).toBe(true)
    expect(titleMatches('Deja vu', 'déjà')).toBe(true)
  })

  it('matches everything when the search is empty', () => {
    expect(titleMatches(title, '')).toBe(true)
    expect(titleMatches(title, '   ')).toBe(true)
  })
})
