import { describe, expect, it } from 'vitest'
import { toCsv } from './csv'

describe('toCsv', () => {
  it('writes rows of text and numbers, with accents untouched', () => {
    expect(
      toCsv([
        ['Student', 'Total'],
        ['Émile Durkheim', 7],
      ]),
    ).toBe('Student,Total\r\nÉmile Durkheim,7\r\n')
  })

  it('quotes cells containing commas, quotes or line breaks', () => {
    expect(toCsv([['Plato, Apology', 'He said "no"', 'two\nlines']])).toBe(
      '"Plato, Apology","He said ""no""","two\nlines"\r\n',
    )
  })

  it('defuses text a spreadsheet would run as a formula, but leaves numbers alone', () => {
    expect(toCsv([['=HYPERLINK("http://evil")', '+1', '-2 days', '@sum', 'fine', -1.5]])).toBe(
      `"'=HYPERLINK(""http://evil"")",'+1,'-2 days,'@sum,fine,-1.5\r\n`,
    )
  })
})
