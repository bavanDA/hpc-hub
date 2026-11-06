// The backend asks for the same syntax: [[path:line]], [[path:first-last]], [[page N]]
const CITE = /\[\[\s*(?:(?:page|p\.)\s*(\d+)|([^[\]\n:]+?):(\d+)(?:\s*[-–]\s*(\d+))?)\s*\]\]/gi

export type Cite = { page: number } | { path: string; line: number; end: number }
export type Part = { text: string } | { cite: Cite; at: number }

/** An answer cut into plain text and citations. */
export function parseCites(text: string): Part[] {
  const out: Part[] = []
  let at = 0
  for (const m of text.matchAll(CITE)) {
    const [, page, path, line, end] = m
    out.push({ text: text.slice(at, m.index) })
    out.push({ at: m.index, cite: page ? { page: Number(page) }
      : { path: path.trim(), line: Number(line), end: Number(end || line) } })
    at = m.index + m[0].length
  }
  out.push({ text: text.slice(at) })
  return out
}

/** "page 3", "line 30", "lines 30 to 34", "results.tex line 30": here is the file the question was about. */
export function citeLabel(c: Cite, here?: string): string {
  if ('page' in c) return `page ${c.page}`
  const name = c.path === here ? 'line' : `${c.path.split('/').pop()} line`
  return c.end !== c.line ? `${name}s ${c.line} to ${c.end}` : `${name} ${c.line}`
}

/** The answer as a note: citations as plain words. */
export const plainCites = (text: string) =>
  text.replace(CITE, (_, page, path, line) => page ? `page ${page}` : `${path.split('/').pop()} line ${line}`)
