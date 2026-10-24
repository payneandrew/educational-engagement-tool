/** "1 annotation", "3 annotations". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
