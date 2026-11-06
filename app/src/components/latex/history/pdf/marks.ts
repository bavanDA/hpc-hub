const WORD = /[\p{L}\p{N}]+/gu

/** The words a person sees for a marked stretch of LaTeX: commands and math signs out. */
export function visibleWords(t: string): string[] {
  return t.replace(/\\[A-Za-z@]+/g, ' ').match(WORD) ?? []
}
