/** Lowercase, with accents removed, so "deja" finds "Déjà" and "thoreau" finds "Thoreau". */
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .trim()

/** Whether a title matches what was typed in the search box. An empty search matches everything. */
export const titleMatches = (title: string, query: string): boolean =>
  normalize(title).includes(normalize(query))
