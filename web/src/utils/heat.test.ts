import { describe, expect, it } from 'vitest'
import { heatBin } from './heat'

describe('heatBin', () => {
  it('leaves zero unshaded and steps up at each boundary', () => {
    expect(heatBin(0)).toBeUndefined()
    expect([1, 2, 3, 4, 5].map((count) => heatBin(count)?.label)).toEqual([
      '1',
      '2–3',
      '2–3',
      '4+',
      '4+',
    ])
  })

  it('keeps the darkest step for any larger count', () => {
    expect(heatBin(250)?.label).toBe('4+')
  })
})
