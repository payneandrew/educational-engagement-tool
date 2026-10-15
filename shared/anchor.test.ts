import { describe, expect, it } from 'vitest'
import { createAnchor, resolveAnchor } from './anchor'

const base = 'The cat sat on the mat. Then the dog sat on the mat. Finally the bird sat on the mat.'

describe('anchoring', () => {
  const start = base.indexOf('sat on the mat', 30) // the dog's mat (2nd occurrence)
  const anchor = createAnchor(base, start, start + 'sat on the mat'.length)

  it('uses offsets when the text is unchanged', () => {
    expect(resolveAnchor(base, anchor)).toMatchObject({ start, method: 'offset' })
  })

  it('re-anchors via context when text is inserted earlier, picking the right duplicate', () => {
    const edited = 'PREFACE. ' + base // everything shifts by 9
    const r = resolveAnchor(edited, anchor)!
    expect(r.method).toBe('context')
    expect(r.start).toBe(start + 9)
    expect(edited.slice(r.start, r.end)).toBe('sat on the mat')
    expect(edited.slice(r.start - 8, r.start)).toBe('the dog ') // the dog's sentence, not cat/bird
  })

  it('refuses to guess between identical candidates with no context', () => {
    const doc = 'abc xyz abc xyz abc'
    const a = createAnchor(doc, 8, 11)
    expect(resolveAnchor('Q' + doc, { ...a, prefix: '', suffix: '' })).toBeNull()
  })

  it('accepts a unique quote even with no context', () => {
    const a = createAnchor('hello brave world', 6, 11)
    expect(resolveAnchor('>> hello brave world', { ...a, prefix: '', suffix: '' })).toMatchObject({ start: 9 })
  })

  it('orphans the annotation when the quoted text is gone', () => {
    expect(resolveAnchor(base.replace('dog sat on the mat', 'dog slept'), anchor)).toBeNull()
  })
})
