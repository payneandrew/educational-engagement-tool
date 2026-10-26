type Cell = string | number

/**
 * One CSV cell: quoted when it needs to be, and defused if a spreadsheet would run it. Text that starts
 * with = + - @ (or a tab or carriage return) is read as a formula when the file is opened in Excel or
 * Sheets, and names and titles come from users, so such text gets a leading apostrophe. Numbers are ours.
 */
function toCell(value: Cell): string {
  if (typeof value === 'number') return String(value)
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const toCsv = (rows: Cell[][]): string =>
  rows.map((row) => row.map(toCell).join(',')).join('\r\n') + '\r\n'

export function downloadCsv(filename: string, rows: Cell[][]): void {
  // The byte-order mark makes Excel read the file as UTF-8, so names like Émile and Ramírez survive.
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  Object.assign(document.createElement('a'), { href: url, download: filename }).click()
  setTimeout(() => URL.revokeObjectURL(url))
}
