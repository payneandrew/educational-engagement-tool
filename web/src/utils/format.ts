export const plural = (count: number, word: string): string =>
  `${count} ${word}${count === 1 ? '' : 's'}`

export const oneDecimal = (value: number): string => value.toFixed(1)

const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "just now", "5 minutes ago", "yesterday", "3 days ago"; older than a week, the date ("Sep 4"). */
export function relativeTime(iso: string, now: number): string {
  const then = Date.parse(iso)
  const ago = now - then
  if (ago < MINUTE) return 'just now'
  if (ago < HOUR) return relative.format(-Math.floor(ago / MINUTE), 'minute')
  if (ago < DAY) return relative.format(-Math.floor(ago / HOUR), 'hour')
  if (ago < 7 * DAY) return relative.format(-Math.floor(ago / DAY), 'day')
  const sameYear = new Date(then).getFullYear() === new Date(now).getFullYear()
  return new Date(then).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

/** "Sep 4, 2026, 2:00 PM": shown on hover next to a relative time. */
export const fullDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })

export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { dateStyle: 'medium' })

/** "Alice Chen" → "AC", "Prof. Dana Reyes" → "DR" (titles like "Prof." are skipped). */
export function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => word && !word.endsWith('.'))
  const letters = words.filter((_, index) => index === 0 || index === words.length - 1)
  return letters.map((word) => word.charAt(0).toLocaleUpperCase()).join('')
}
