// Links in a terminal, including ones drawn over several rows. Claude Code (and tmux, which redraws every row) cuts a
// long link like its login link into full-width rows with no mark that they belong together, so the usual link
// finder saw only pieces. Here a row that runs to the right edge goes on in the row below when that row carries on
// with the link (it starts at its first column, with no space): the whole link is one link, on every row it covers.

/** One link: its address and where it is, as 1-based columns and 0-based buffer rows (end inclusive). */
export type Found = { url: string; start: { x: number; y: number }; end: { x: number; y: number } }

const URL = /https?:\/\/[^\s"'<>`]+/g
const TRAILING = /[.,;:!?'")\]}>]+$/  // sentence punctuation after a link is not part of it
const CONTINUES = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]/

/** row(i): buffer row i's text, every cell (so a full row is cols long), or undefined past the buffer. */
export function linksAt(row: (i: number) => string | undefined, cols: number, y: number): Found[] {
  const text = row(y)
  if (text === undefined) return []
  const full = (i: number) => { const t = row(i); return t !== undefined && t.length >= cols && t[cols - 1] !== ' ' }
  const goesOn = (i: number) => { const t = row(i); return t !== undefined && CONTINUES.test(t) && !/^https?:\/\//.test(t) }
  let top = y, bottom = y
  for (let n = 0; n < 50 && top > 0 && full(top - 1) && goesOn(top); n++) top--
  for (let n = 0; n < 50 && full(bottom) && goesOn(bottom + 1); n++) bottom++
  // the rows as one line: every row but the last is exactly cols wide, so a position maps straight back to a cell
  let joined = ''
  for (let i = top; i <= bottom; i++) joined += i < bottom ? row(i)!.slice(0, cols) : row(i)!
  const at = (k: number) => ({ x: (k % cols) + 1, y: top + Math.floor(k / cols) })
  const out: Found[] = []
  for (const m of joined.matchAll(URL)) {
    const url = m[0].replace(TRAILING, '')
    if (url.length <= 'https://'.length) continue
    const start = at(m.index!), end = at(m.index! + url.length - 1)
    if (start.y <= y && end.y >= y) out.push({ url, start, end })
  }
  return out
}
