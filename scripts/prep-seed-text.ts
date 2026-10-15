// One-off: downloads public-domain texts from Project Gutenberg, strips the
// boilerplate, unwraps hard-wrapped lines into paragraphs, and keeps an excerpt.
// Output is committed under seed-data/, so this does not need to run again.
import { writeFileSync } from 'node:fs'

const sources = [
  { file: 'civil-disobedience.txt', url: 'https://www.gutenberg.org/cache/epub/71/pg71.txt', maxWords: 3500 },
  { file: 'on-liberty-ch2.txt', url: 'https://www.gutenberg.org/cache/epub/34901/pg34901.txt', from: /CHAPTER II\.\s*\n\s*OF THE LIBERTY OF THOUGHT/, maxWords: 3500 },
  { file: 'natural-selection.txt', url: 'https://www.gutenberg.org/cache/epub/1228/pg1228.txt', from: /CHAPTER IV\.?\s*\n\s*NATURAL SELECTION/i, maxWords: 3500 },
]

for (const s of sources) {
  let t = (await (await fetch(s.url)).text()).replace(/\r/g, '')
  t = t.split(/\*\*\* ?START OF[^\n]*\n/)[1] ?? t
  t = t.split(/\*\*\* ?END OF/)[0]
  if (s.from) {
    const matches = [...t.matchAll(new RegExp(s.from, 'gi'))]
    const m = matches[matches.length > 1 ? 1 : 0] // skip table-of-contents hit
    t = t.slice(m.index)
  }
  const paras = t.split(/\n\s*\n/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
  const out: string[] = []
  let words = 0
  for (const p of paras) {
    if (words > s.maxWords) break
    out.push(p); words += p.split(/\s+/).length
  }
  writeFileSync(`seed-data/${s.file}`, out.join('\n\n') + '\n')
  console.log(s.file, words, 'words', out.length, 'paragraphs')
}
