/** Jump to a cited line in the editor, or a page of the PDF. */
export type Go = { line: (path: string, line: number) => void; page: (page: number) => void }
