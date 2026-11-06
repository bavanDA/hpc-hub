export const LETTER = /[A-Za-z@]/

export function stripComments(s: string): string {
  return s.replace(/^[ \t]*%.*\r?\n/gm, '').replace(/(^|[^\\])%.*$/gm, '$1')
}

/** Where the bracket opened at i closes (skipping \{ and nested ones), or the end. */
export function closing(s: string, i: number, open = '{', shut = '}'): number {
  let depth = 0
  for (let j = i; j < s.length; j++) {
    const c = s[j]
    if (c === '\\') { j++; continue }
    if (c === open) depth++
    else if (c === shut && --depth === 0) return j
    else if (open === '[' && c === '{') j = closing(s, j)  // [a{]}b] is one optional argument
  }
  return s.length
}

/** \begin{name} ... \end{name} from i (at \begin): the body's start and end, and where the \end ends. */
export function envSpan(s: string, i: number, name: string): [number, number, number] {
  const open = `\\begin{${name}}`, shut = `\\end{${name}}`
  const start = i + open.length
  let depth = 1, j = start
  while (j < s.length) {
    const a = s.indexOf(open, j), b = s.indexOf(shut, j)
    if (b < 0) return [start, s.length, s.length]
    if (a >= 0 && a < b) { depth++; j = a + open.length; continue }
    if (--depth === 0) return [start, b, b + shut.length]
    j = b + shut.length
  }
  return [start, s.length, s.length]
}

export class Src {
  s: string
  i = 0
  constructor(s: string) { this.s = s }
  get done() { return this.i >= this.s.length }
  at(re: RegExp) { re.lastIndex = this.i; return re.test(this.s) }
  space() { while (this.i < this.s.length && /[ \t\r\n]/.test(this.s[this.i])) this.i++ }
  /** {…} after optional spaces, or null. */
  group(): string | null {
    const back = this.i
    this.space()
    if (this.s[this.i] !== '{') { this.i = back; return null }
    const end = closing(this.s, this.i)
    const inner = this.s.slice(this.i + 1, end)
    this.i = end + 1
    return inner
  }
  /** […] after optional spaces, or null. */
  opt(): string | null {
    const back = this.i
    this.space()
    if (this.s[this.i] !== '[') { this.i = back; return null }
    const end = closing(this.s, this.i, '[', ']')
    const inner = this.s.slice(this.i + 1, end)
    this.i = end + 1
    return inner
  }
  /** One argument: a group, or a single token. */
  arg(): string {
    const g = this.group()
    if (g !== null) return g
    this.space()
    if (this.s[this.i] === '\\') { const n = this.name(); return '\\' + n }
    return this.s[this.i++] ?? ''
  }
  /** A command's name, from just after its backslash. */
  name(): string {
    const start = this.i
    if (LETTER.test(this.s[this.i] ?? '')) { while (LETTER.test(this.s[this.i] ?? '')) this.i++ } else this.i++
    return this.s.slice(start, this.i)
  }
  star() { if (this.s[this.i] === '*') { this.i++; return true } return false }
  /** Up to (not including) the closing text, which is skipped. */
  until(end: string): string {
    let j = this.i
    while (j < this.s.length && !this.s.startsWith(end, j)) j += this.s[j] === '\\' ? 2 : 1
    const inner = this.s.slice(this.i, j)
    this.i = Math.min(this.s.length, j + end.length)
    return inner
  }
}

/** Splits at a token (\\, \item) that is not inside braces or an inner environment. */
export function splitTop(s: string, token: string): string[] {
  const out: string[] = []
  let last = 0
  for (let j = 0; j < s.length; j++) {
    if (s.startsWith(token, j) && !(token[1] && LETTER.test(token[1]) && LETTER.test(s[j + token.length] ?? ''))) {
      out.push(s.slice(last, j))
      j += token.length - 1
      last = j + 1
      continue
    }
    const c = s[j]
    if (c === '{') j = closing(s, j)
    else if (s.startsWith('\\begin{', j)) {
      const name = s.slice(j + 7, s.indexOf('}', j))
      j = envSpan(s, j, name)[2] - 1
    } else if (c === '\\') j++
  }
  out.push(s.slice(last))
  return out
}

/** Where a definition (\newcommand{\a}[1]{…}) that starts at i ends. */
export function defEnd(s: string, i: number): number {
  const S = new Src(s)
  S.i = i + 1
  const name = S.name()
  S.star()
  if (name === 'def') {
    S.space()
    if (S.s[S.i] === '\\') { S.i++; S.name() }
    while (/#\d/.test(S.s.slice(S.i, S.i + 2))) S.i += 2
    S.group()
    return S.i
  }
  for (let k = 0; k < 6; k++) {
    const back = S.i
    if (S.opt() === null && S.group() === null) { S.i = back; break }
  }
  return S.i
}
