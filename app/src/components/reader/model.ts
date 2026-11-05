// The paper as the Reader shows it: headings, paragraphs, display math, lists and boxes, from the LaTeX source
// (latex.ts) or from the PDF's text (pdftext.ts). page is where a block sits in the PDF, when known.

export type Inline =
  | { t: 'text'; s: string }
  | { t: 'em' | 'b' | 'code' | 'sc'; c: Inline[] }
  | { t: 'math'; tex: string }
  | { t: 'ref'; key: string; style: 'ref' | 'eq' | 'named' }  // \ref, \eqref, \cref and \autoref
  | { t: 'cite'; keys: string[] }
  | { t: 'note'; n: number }  // a footnote's marker
  | { t: 'br' }

/** x0, y0, x1, y1 in PDF points from the page's top left */
export type Box = [number, number, number, number]

export type Block = { page?: number } & (
  | { t: 'title'; c: Inline[]; by: Inline[] }
  | { t: 'h'; level: number; num: string; c: Inline[] }
  | { t: 'p'; c: Inline[]; small?: boolean }
  | { t: 'math'; tex: string; tags: string[] }
  | { t: 'cut'; box: Box; tag?: string }  // display math cut from the PDF page
  | { t: 'list'; ordered: boolean; items: { label?: Inline[]; c: Block[] }[] }
  | { t: 'box'; label: Inline[]; c: Block[]; kind: 'thm' | 'proof' | 'abstract' | 'quote' }
  | { t: 'caption'; label: string; c: Inline[] }
  | { t: 'code'; s: string }
  | { t: 'notes'; items: { n: number; c: Inline[] }[] }
  | { t: 'refs'; items: { key: string; label: string; c: Inline[] }[] }
)

export type Doc = {
  blocks: Block[]
  from: 'source' | 'pdf'
  labels: Record<string, { num: string; kind: string }>  // \label: its number and what it is (Section, Figure)
  cites: Record<string, string>  // citation key: what shows in the brackets
  macros: Record<string, string>  // \newcommand and friends, for KaTeX
}

/** The words of some inline content, for search, page matching and the Contents. */
export function plain(c: Inline[]): string {
  return c.map((x) => x.t === 'text' ? x.s : 'c' in x ? plain(x.c) : x.t === 'br' ? ' ' : '').join('')
}
