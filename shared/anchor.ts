/**
 * Text anchoring: a highlight is stored as a character-offset range PLUS the quoted
 * text and a little surrounding context (the "W3C TextQuoteSelector + TextPosition"
 * pairing). Offsets are the fast path; the quote + context let us re-find the range
 * if the source text has shifted underneath us.
 */
export interface Anchor {
  start: number // offset into the document text (UTF-16 code units, like JS strings)
  end: number // exclusive
  exact: string // the selected text
  prefix: string // up to CONTEXT_CHARS before `start`
  suffix: string // up to CONTEXT_CHARS after `end`
}

export const CONTEXT_CHARS = 32
const MIN_CONTEXT_SCORE = 8 // chars of prefix+suffix agreement required to disambiguate duplicates

export function createAnchor(text: string, start: number, end: number): Anchor {
  return {
    start,
    end,
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CONTEXT_CHARS), start),
    suffix: text.slice(end, end + CONTEXT_CHARS),
  }
}

export interface ResolvedAnchor {
  start: number
  end: number
  /** 'offset' = untouched; 'context' = the text moved and we re-found it. */
  method: 'offset' | 'context'
}

const commonSuffixLen = (a: string, b: string) => {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}
const commonPrefixLen = (a: string, b: string) => {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/**
 * Find where an anchor lives in `text` now. Returns null when it can't be placed
 * (an "orphaned" annotation — the UI should still show it, just not inline).
 */
export function resolveAnchor(text: string, a: Anchor): ResolvedAnchor | null {
  if (a.exact.length === 0) return null
  // Fast path: offsets still point at the same text.
  if (text.slice(a.start, a.end) === a.exact) return { start: a.start, end: a.end, method: 'offset' }

  // Slow path: every occurrence of the quote, scored by how well the surrounding
  // context matches, with proximity to the old offset as the tiebreaker.
  let best: { start: number; score: number; dist: number } | null = null
  let candidates = 0
  for (let i = text.indexOf(a.exact); i !== -1; i = text.indexOf(a.exact, i + 1)) {
    const score =
      commonSuffixLen(text.slice(Math.max(0, i - a.prefix.length), i), a.prefix) +
      commonPrefixLen(text.slice(i + a.exact.length, i + a.exact.length + a.suffix.length), a.suffix)
    const dist = Math.abs(i - a.start)
    candidates++
    if (!best || score > best.score || (score === best.score && dist < best.dist)) best = { start: i, score, dist }
  }
  // If the quote is ambiguous and the context doesn't clearly single one out, orphan
  // rather than silently attach the comment to the wrong sentence.
  if (best && candidates > 1 && best.score < MIN_CONTEXT_SCORE) return null
  return best ? { start: best.start, end: best.start + a.exact.length, method: 'context' } : null
}
