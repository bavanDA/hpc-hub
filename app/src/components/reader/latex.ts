// A LaTeX paper's source as the Reader's blocks: sections with their numbers, paragraphs with inline math, display
// math with equation numbers, lists, theorems, captions, footnotes, \ref and \cite resolved. Not a TeX engine: it
// reads the common parts of papers and skips what it doesn't know, keeping the words.
import type { Block, Doc, Inline } from './model'

export type Read = (path: string) => Promise<string>

// -- scanning ------------------------------------------------------------------------------------------------------
const LETTER = /[A-Za-z@]/

export function stripComments(s: string): string {
  return s.replace(/^[ \t]*%.*\r?\n/gm, '').replace(/(^|[^\\])%.*$/gm, '$1')
}

/** Where the bracket opened at i closes (skipping \{ and nested ones), or the end. */
function closing(s: string, i: number, open = '{', shut = '}'): number {
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
function envSpan(s: string, i: number, name: string): [number, number, number] {
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

class Src {
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
function splitTop(s: string, token: string): string[] {
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

// -- what a document defines -------------------------------------------------------------------------------------
type Theorem = { title: string; counter: string; within: string; numbered: boolean }
type Macro = { args: number; def: string | null; body: string }

const THEOREMS = ['theorem', 'lemma', 'corollary', 'proposition', 'definition', 'remark', 'example', 'claim',
  'conjecture', 'assumption', 'fact', 'observation', 'problem', 'question', 'exercise', 'notation', 'hypothesis']
const DISPLAY = ['equation', 'align', 'gather', 'multline', 'eqnarray', 'alignat', 'flalign', 'displaymath', 'math']
const SKIP_ENVS = ['tikzpicture', 'picture', 'tabular', 'tabularx', 'tabular*', 'longtable', 'comment', 'filecontents',
  'filecontents*', 'thebibliography', 'titlepage']
const LISTS = ['itemize', 'enumerate', 'description', 'compactitem', 'compactenum', 'inparaenum', 'enumerate*']
const FLOATS: Record<string, string> = { figure: 'Figure', 'figure*': 'Figure', table: 'Table', 'table*': 'Table',
  algorithm: 'Algorithm', 'algorithm*': 'Algorithm', wrapfigure: 'Figure', listing: 'Listing' }
const CODE = ['verbatim', 'verbatim*', 'lstlisting', 'minted', 'Verbatim', 'alltt']
/** Commands whose arguments are not text: how many groups to skip. */
const SKIP: Record<string, number> = {
  label: 1, vspace: 1, hspace: 1, includegraphics: 1, bibliographystyle: 1, pagestyle: 1, thispagestyle: 1,
  hypersetup: 1, graphicspath: 1, linespread: 1, color: 1, captionsetup: 1, sisetup: 1, theoremstyle: 1, nocite: 1,
  index: 1, markright: 1, enlargethispage: 1, setlist: 1, usetikzlibrary: 1, tikzset: 1, pgfplotsset: 1,
  mathtoolsset: 1, geometry: 1, vskip: 0, setlength: 2, addtolength: 2, setcounter: 2, addtocounter: 2,
  numberwithin: 2, markboth: 2, definecolor: 3, addcontentsline: 3, newenvironment: 3, renewenvironment: 3,
  crefname: 3, Crefname: 3, newcommand: 2, renewcommand: 2, providecommand: 2, DeclareMathOperator: 2,
  DeclarePairedDelimiter: 3, newtheorem: 2, input: 1, include: 1, usepackage: 1, documentclass: 1, title: 1,
  author: 1, date: 1, thanks: 1, keywords: 0, newpage: 0, clearpage: 0, cleardoublepage: 0, tableofcontents: 0,
  listoffigures: 0, listoftables: 0, noindent: 0, centering: 0, raggedright: 0, raggedleft: 0, par: 0, indent: 0,
  smallskip: 0, medskip: 0, bigskip: 0, hfill: 0, vfill: 0, null: 0, protect: 0, footnotesize: 0, small: 0,
  normalsize: 0, large: 0, Large: 0, LARGE: 0, huge: 0, Huge: 0, scriptsize: 0, tiny: 0, maketitle: 0, appendix: 0,
  phantomsection: 0, frontmatter: 0, mainmatter: 0, backmatter: 0, linebreak: 0, pagebreak: 0, nolinebreak: 0,
  allowbreak: 0, sloppy: 0, onecolumn: 0, twocolumn: 0, balance: 0, selectfont: 0, normalfont: 0, rmfamily: 0,
  sffamily: 0, bibliography: 1, printbibliography: 0, addbibresource: 1, textcolor: 1, colorbox: 1,
}
const WORDS: Record<string, string> = {
  LaTeX: 'LaTeX', TeX: 'TeX', ldots: '…', dots: '…', textellipsis: '…', today: '', ss: 'ß', o: 'ø', O: 'Ø',
  ae: 'æ', AE: 'Æ', oe: 'œ', OE: 'Œ', aa: 'å', AA: 'Å', l: 'ł', L: 'Ł', i: 'ı', j: 'ȷ', textendash: '–',
  textemdash: '—', textquoteleft: '‘', textquoteright: '’', textbullet: '•', textasciitilde: '~', S: '§', P: '¶',
  copyright: '©', textregistered: '®', texttrademark: '™', textdegree: '°', quad: ' ', qquad: '  ', enspace: ' ',
  thinspace: ' ', textbackslash: '\\', textbar: '|', textless: '<', textgreater: '>', eg: 'e.g.', ie: 'i.e.',
  etal: 'et al.', etc: 'etc.', vs: 'vs.', cf: 'cf.', wrt: 'w.r.t.',
}
const ACCENTS: Record<string, string> = { "'": '́', '`': '̀', '^': '̂', '"': '̈', '~': '̃',
  '=': '̄', '.': '̇', c: '̧', v: '̌', u: '̆', H: '̋', k: '̨', r: '̊',
  d: '̣', b: '̱' }
const STYLES: Record<string, 'em' | 'b' | 'code' | 'sc' | ''> = { emph: 'em', textit: 'em', textsl: 'em', mathit: 'em',
  textbf: 'b', mathbf: 'b', texttt: 'code', url: 'code', path: 'code', textsc: 'sc', textrm: '', textsf: '',
  textnormal: '', textup: '', text: '', mbox: '', hbox: '', underline: 'em', uline: 'em', textmd: '', fbox: '',
  makebox: '', framebox: '', mathrm: '', ensuremath: '', NoCaseChange: '' }
const DECLARED: Record<string, 'em' | 'b' | 'code' | 'sc'> = { em: 'em', it: 'em', itshape: 'em', sl: 'em',
  slshape: 'em', bf: 'b', bfseries: 'b', tt: 'code', ttfamily: 'code', sc: 'sc', scshape: 'sc' }
const CITES = /^(cite|citep|citet|citealp|citealt|parencite|textcite|autocite|footcite|citeyear|citeauthor|Cite|Citep|Citet|supercite|smartcite|cites)$/
const REFS: Record<string, 'ref' | 'eq' | 'named'> = { ref: 'ref', pageref: 'ref', nameref: 'ref', eqref: 'eq',
  autoref: 'named', cref: 'named', Cref: 'named', vref: 'named', Vref: 'named', subref: 'ref', labelcref: 'ref' }

const letters = (n: number) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s }

class Paper {
  labels: Doc['labels'] = {}
  macros: Record<string, Macro> = {}
  theorems: Record<string, Theorem> = {}
  title = ''
  author = ''
  chapters = false
  eqWithin = ''  // equations numbered within: '', 'section' or 'chapter'
  appendix = false
  counters: Record<string, number> = {}
  within: Record<string, string> = {}  // a counter's prefix when it was last stepped (a new section starts over)
  heads: Record<string, string> = { chapter: '', section: '', subsection: '' }
  current = { num: '', kind: '' }  // what a \label names now
  notes: { n: number; c: Inline[] }[] = []
  noteN = 0
  cited: string[] = []
  bib: { key: string; label: string; text: string }[] = []
  depth = 0

  step(counter: string, prefix = ''): number {
    if (this.within[counter] !== prefix) { this.within[counter] = prefix; this.counters[counter] = 0 }
    return (this.counters[counter] = (this.counters[counter] ?? 0) + 1)
  }

  // -- the preamble ----------------------------------------------------------------------------------------------
  define(pre: string) {
    const S = new Src(pre)
    while (!S.done) {
      if (S.s[S.i] !== '\\') { S.i++; continue }
      S.i++
      const name = S.name()
      if (/^(newcommand|renewcommand|providecommand)$/.test(name)) {
        S.star()
        const target = S.arg().trim()
        const n = Number(S.opt() ?? 0) || 0
        const def = S.opt()
        const body = S.group() ?? ''
        if (target.startsWith('\\')) this.macros[target.slice(1)] = { args: n, def, body }
      } else if (name === 'def') {
        S.space()
        if (S.s[S.i] !== '\\') continue
        S.i++
        const target = S.name()
        const params = S.s.slice(S.i).match(/^(#\d)*/)?.[0] ?? ''
        S.i += params.length
        this.macros[target] = { args: params.length / 2, def: null, body: S.group() ?? '' }
      } else if (name === 'DeclareMathOperator') {
        const star = S.star()
        const target = S.arg().trim().slice(1)
        this.macros[target] = { args: 0, def: null, body: `\\operatorname${star ? '*' : ''}{${S.group() ?? ''}}` }
      } else if (name === 'DeclarePairedDelimiter') {
        const target = S.arg().trim().slice(1)
        const l = S.arg(), r = S.arg()
        this.macros[target] = { args: 1, def: null, body: `\\left${l}#1\\right${r}` }
      } else if (name === 'newtheorem') {
        const star = S.star()
        const env = S.group() ?? ''
        const shared = S.opt()
        const title = S.group() ?? env
        const within = S.opt() ?? ''
        this.theorems[env] = { title, counter: shared ?? env, within, numbered: !star }
      } else if (name === 'numberwithin') {
        const what = S.group(), within = S.group()
        if (what === 'equation' && within) this.eqWithin = within
      } else if (name === 'title') { S.opt(); this.title = S.group() ?? '' } else if (name === 'author') {
        S.opt()
        this.author = S.group() ?? ''
      }
    }
  }

  katexMacros(): Record<string, string> {
    const out: Record<string, string> = { '\\bm': '\\boldsymbol{#1}', '\\mathbbm': '\\mathbb{#1}',
      '\\bbR': '\\mathbb{R}', '\\one': '\\mathbf{1}', '\\textsc': '\\text{#1}', '\\emph': '\\textit{#1}',
      '\\mathscr': '\\mathcal{#1}', '\\textsl': '\\textit{#1}', '\\xspace': '' }
    for (const [k, m] of Object.entries(this.macros)) out[`\\${k}`] = m.body
    return out
  }

  // -- numbering -------------------------------------------------------------------------------------------------
  heading(cmd: string, star: boolean): { level: number; num: string } {
    const order = this.chapters ? ['chapter', 'section', 'subsection', 'subsubsection', 'paragraph']
      : ['section', 'subsection', 'subsubsection', 'paragraph']
    const at = Math.max(0, order.indexOf(cmd))
    if (cmd === 'part' || star || cmd === 'paragraph' || cmd === 'subparagraph') return { level: at + 1, num: '' }
    const top = order[0]
    if (cmd === top) {
      const n = (this.counters[top] = (this.counters[top] ?? 0) + 1)
      this.heads[top] = this.appendix ? letters(n) : String(n)
      for (const c of order.slice(1)) this.counters[c] = 0
    } else {
      this.counters[cmd] = (this.counters[cmd] ?? 0) + 1
      for (const c of order.slice(at + 1)) this.counters[c] = 0
    }
    const parts = order.slice(0, at + 1).map((c, k) => k === 0 ? this.heads[top] : String(this.counters[c] ?? 0))
    const num = parts.join('.')
    for (const c of order.slice(0, at + 1)) this.heads[c] = parts.slice(0, order.indexOf(c) + 1).join('.')
    this.current = { num, kind: cmd === 'chapter' ? 'Chapter' : this.appendix && at === 0 ? 'Appendix' : 'Section' }
    return { level: at + 1, num }
  }

  equation(): string {
    const within = this.eqWithin || (this.chapters ? 'chapter' : '')
    const prefix = within ? this.heads[within] ?? '' : ''
    const n = this.step('equation', prefix)
    return prefix ? `${prefix}.${n}` : String(n)
  }

  label(key: string, num = this.current.num, kind = this.current.kind) {
    if (key) this.labels[key.trim()] = { num, kind }
  }

  // -- blocks ----------------------------------------------------------------------------------------------------
  blocks(src: string): Block[] {
    const out: Block[] = []
    let para = ''
    const flush = () => {
      const c = this.inline(para)
      para = ''
      if (c.some((x) => x.t !== 'text' || x.s.trim())) out.push({ t: 'p', c: trim(c) })
      if (this.notes.length) { out.push({ t: 'notes', items: this.notes }); this.notes = [] }
    }
    const S = new Src(src)
    const BLANK = /\n[ \t]*\r?\n\s*/y
    while (!S.done) {
      const ch = S.s[S.i]
      if (ch === '\n' && S.at(BLANK)) { flush(); S.i = BLANK.lastIndex; continue }
      if (ch === '$' && S.s[S.i + 1] === '$') { flush(); S.i += 2; out.push(this.display('equation*', S.until('$$'))); continue }
      if (ch === '$') { const a = S.i; S.i++; S.until('$'); para += S.s.slice(a, S.i); continue }
      if (ch === '{') { const a = S.i; S.group(); para += S.s.slice(a, S.i); continue }
      if (ch !== '\\') { para += ch; S.i++; continue }
      const at = S.i
      S.i++
      const name = S.name()
      if (name === '[') { flush(); out.push(this.display('equation*', S.until('\\]'))); continue }
      if (name === '(') { para += '\\(' + S.until('\\)') + '\\)'; continue }
      if (name === 'begin') {
        const env = (S.group() ?? '').trim()
        const [b0, b1, end] = envSpan(S.s, at, env)
        S.i = b0
        const body = S.s.slice(b0, b1)
        S.i = end
        if (env === 'math') { para += `$${body}$`; continue }
        flush()
        out.push(...this.environment(env, body))
        continue
      }
      if (/^(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)$/.test(name)) {
        flush()
        const star = S.star()
        S.opt()
        const title = S.group() ?? ''
        const { level, num } = this.heading(name, star)
        out.push({ t: 'h', level, num, c: this.inline(title) })
        continue
      }
      if (name === 'maketitle') {
        flush()
        if (this.title) {
          const by = this.author.replace(/\\thanks\s*\{/g, '\\thanks{').replace(/\s*\\(and|AND)\b\s*/g, ', ')
            .replace(/\\\\/g, ', ')
          out.push({ t: 'title', c: this.inline(this.title.replace(/\\\\/g, ' ')), by: this.inline(by) })
        }
        continue
      }
      if (name === 'title' || name === 'author') {
        S.opt()
        const v = S.group() ?? ''
        if (name === 'title') this.title = v
        else this.author = v
        continue
      }
      if (name === 'appendix') {
        this.appendix = true
        this.counters[this.chapters ? 'chapter' : 'section'] = 0
        continue
      }
      if (name === 'bibliography' || name === 'printbibliography') {
        flush()
        if (name === 'bibliography') S.group()
        else S.opt()
        if (this.bib.length) out.push({ t: 'h', level: 1, num: '', c: [{ t: 'text', s: 'References' }] }, this.refs())
        continue
      }
      if (name === 'par' || name === 'item') { flush(); continue }
      if (name === 'newtheorem' || /^(newcommand|renewcommand|providecommand|def|DeclareMathOperator)$/.test(name)) {
        const end = defEnd(S.s, at)
        this.define(S.s.slice(at, end))
        S.i = end
        continue
      }
      para += S.s.slice(at, S.i)
    }
    flush()
    return out
  }

  environment(env: string, body: string): Block[] {
    const base = env.replace(/\*$/, '')
    if (DISPLAY.includes(base) || base === 'subequations') {
      return base === 'subequations' ? this.blocks(body) : [this.display(env, body)]
    }
    if (LISTS.includes(env)) return [this.list(env, body)]
    if (env === 'abstract') {
      return [{ t: 'box', kind: 'abstract', label: [{ t: 'text', s: 'Abstract' }], c: this.blocks(body) }]
    }
    if (env === 'proof') {
      const S = new Src(body)
      const name = S.opt()
      return [{ t: 'box', kind: 'proof', label: name ? this.inline(name) : [{ t: 'text', s: 'Proof' }],
        c: this.blocks(S.s.slice(S.i)) }]
    }
    if (/^(quote|quotation|verse)$/.test(env)) return [{ t: 'box', kind: 'quote', label: [], c: this.blocks(body) }]
    if (CODE.includes(env)) {
      const code = env === 'minted' ? body.replace(/^\s*(\[[^\]]*\])?\s*\{[^}]*\}/, '') : body.replace(/^\s*\[[^\]]*\]/, '')
      return [{ t: 'code', s: code.replace(/^\n|\n\s*$/g, '') }]
    }
    if (env in FLOATS) return this.float(FLOATS[env], body)
    if (env === 'thebibliography') { this.bib = bibitems(body); return [this.refs()] }
    if (SKIP_ENVS.includes(env)) return []
    const thm = this.theorems[env] ?? this.theorems[base] ??
      (THEOREMS.includes(base) ? { title: base[0].toUpperCase() + base.slice(1), counter: 'theorem', within: '',
        numbered: !env.endsWith('*') } : null)
    if (thm) {
      const S = new Src(body)
      const name = S.opt()
      let label = thm.title
      if (thm.numbered) {
        const prefix = thm.within ? this.heads[thm.within] ?? '' : ''
        const n = this.step(`thm:${thm.counter}`, prefix)
        const num = prefix ? `${prefix}.${n}` : String(n)
        label += ` ${num}`
        this.current = { num, kind: thm.title }
      }
      const c: Inline[] = [{ t: 'text', s: label }]
      if (name) c.push({ t: 'text', s: ' (' }, ...this.inline(name), { t: 'text', s: ')' })
      return [{ t: 'box', kind: 'thm', label: c, c: this.blocks(S.s.slice(S.i)) }]
    }
    if (env === 'minipage') { const S = new Src(body); S.opt(); S.group(); return this.blocks(S.s.slice(S.i)) }
    return this.blocks(body)  // center, small, and environments it doesn't know: their text
  }

  float(kind: string, body: string): Block[] {
    const num = String(this.step(kind))
    this.current = { num, kind }
    const at = body.search(/\\caption\b/)
    for (const m of body.matchAll(/\\label\s*\{([^}]*)\}/g)) this.label(m[1], num, kind)
    if (at < 0) return []
    const S = new Src(body)
    S.i = at + '\\caption'.length
    S.star()
    S.opt()
    return [{ t: 'caption', label: `${kind} ${num}`, c: trim(this.inline(S.group() ?? '')) }]
  }

  list(env: string, body: string): Block {
    const ordered = /enum/.test(env)
    const [, ...items] = splitTop(body, '\\item')
    return { t: 'list', ordered, items: items.map((raw, k) => {
      const S = new Src(raw)
      const label = S.opt()
      if (ordered) this.current = { num: String(k + 1), kind: 'Item' }
      return { label: label !== null ? this.inline(label) : undefined, c: this.blocks(S.s.slice(S.i)) }
    }) }
  }

  display(env: string, body: string): Block {
    const base = env.replace(/\*$/, '')
    const numbered = !env.endsWith('*') && base !== 'displaymath' && base !== 'math'
    const multi = /^(align|gather|eqnarray|alignat|flalign)$/.test(base)
    const rows = multi ? splitTop(body, '\\\\') : [body]
    const free = (t: string) => numbered && !/\\no(number|tag)\b/.test(t)
    const tags = (base === 'multline' ? [body] : rows).map((row) => {
      const tag = row.match(/\\tag\*?\s*\{([^}]*)\}/)?.[1]
      const num = tag ?? (free(row) && (rows.length === 1 || row.trim()) ? this.equation() : '')
      const label = row.match(/\\label\s*\{([^}]*)\}/)?.[1]
      if (label) this.label(label, num, 'Equation')
      return num
    })
    let tex = body.replace(/\\(label|tag\*?)\s*\{[^}]*\}/g, '').replace(/\\no(number|tag)\b/g, '')
      .replace(/\\begin\{split\}/g, '\\begin{aligned}').replace(/\\end\{split\}/g, '\\end{aligned}')
    if (base === 'alignat') {
      const S = new Src(tex)
      const n = S.group()
      tex = `\\begin{alignedat}{${n}}${S.s.slice(S.i)}\\end{alignedat}`
    } else if (multi && base !== 'gather') tex = `\\begin{aligned}${tex}\\end{aligned}`
    else if (base === 'gather' || base === 'multline') tex = `\\begin{gathered}${tex}\\end{gathered}`
    return { t: 'math', tex: tex.trim(), tags: tags.some(Boolean) ? tags : [] }
  }

  refs(): Block {
    return { t: 'refs', items: this.bib.map((b) => ({ key: b.key, label: b.label, c: trim(this.inline(b.text)) })) }
  }

  // -- inline --------------------------------------------------------------------------------------------------
  inline(src: string): Inline[] {
    const out: Inline[] = []
    let text = ''
    const put = (...xs: Inline[]) => {
      if (text) { out.push({ t: 'text', s: text }); text = '' }
      out.push(...xs)
    }
    const S = new Src(src)
    while (!S.done) {
      const ch = S.s[S.i]
      if (ch === '$') {
        const two = S.s[S.i + 1] === '$'
        S.i += two ? 2 : 1
        const tex = S.until(two ? '$$' : '$')
        put({ t: 'math', tex: two ? `\\displaystyle ${tex}` : tex })
        continue
      }
      if (ch === '{') {
        const g = S.group() ?? ''
        const m = g.match(/^\s*\\([A-Za-z]+)\b\s*/)
        const style = m && DECLARED[m[1]]
        if (style) put({ t: style, c: this.inline(g.slice(m[0].length)) })
        else put(...this.inline(g))
        continue
      }
      S.i++
      if (ch === '}') continue
      if (ch === '~') { text += ' '; continue }
      if (/\s/.test(ch)) { if (!/\s$/.test(text)) text += ' '; continue }
      if (ch === '-') {
        if (S.s.startsWith('--', S.i)) { text += '—'; S.i += 2 } else if (S.s[S.i] === '-') { text += '–'; S.i++ }
        else text += '-'
        continue
      }
      if (ch === '`') { if (S.s[S.i] === '`') { text += '“'; S.i++ } else text += '‘'; continue }
      if (ch === "'") { if (S.s[S.i] === "'") { text += '”'; S.i++ } else text += '’'; continue }
      if (ch !== '\\') { text += ch; continue }
      const name = S.name()
      if (name in ACCENTS && (name.length === 1 && !LETTER.test(name) || !LETTER.test(S.s[S.i] ?? ''))) {
        const base = S.arg().replace(/\\i\b/, 'i').replace(/\\j\b/, 'j')
        text += (base.slice(0, 1) + ACCENTS[name]).normalize('NFC') + base.slice(1)
        continue
      }
      if (name.length === 1 && !LETTER.test(name)) {
        if (name === '\\') { S.star(); S.opt(); put({ t: 'br' }) } else if (name === '(') put({ t: 'math', tex: S.until('\\)') })
        else if (name === '[') put({ t: 'math', tex: `\\displaystyle ${S.until('\\]')}` })
        else if ('%&$#_{}'.includes(name)) text += name
        else if (', ;:'.includes(name)) text += name === ',' ? ' ' : ' '
        continue
      }
      S.star()
      if (name in STYLES) {
        if (name === 'makebox' || name === 'framebox') { S.opt(); S.opt() }
        const inner = this.inline(S.arg())
        const st = STYLES[name]
        if (st) put({ t: st, c: inner })
        else put(...inner)
        continue
      }
      if (name in DECLARED) { put({ t: DECLARED[name], c: this.inline(S.s.slice(S.i)) }); S.i = S.s.length; continue }
      if (CITES.test(name)) {
        S.opt(); S.opt()
        const keys = (S.group() ?? '').split(',').map((k) => k.trim()).filter(Boolean)
        for (const k of keys) if (!this.cited.includes(k)) this.cited.push(k)
        put({ t: 'cite', keys })
        continue
      }
      if (name in REFS) { put({ t: 'ref', key: (S.group() ?? '').split(',')[0].trim(), style: REFS[name] }); continue }
      if (name === 'label') { this.label(S.group() ?? ''); continue }
      if (name === 'footnote' || name === 'footnotetext') {
        S.opt()
        const n = ++this.noteN
        this.notes.push({ n, c: trim(this.inline(S.group() ?? '')) })
        put({ t: 'note', n })
        continue
      }
      if (name === 'thanks') { S.group(); continue }
      if (name === 'href') { S.group(); put(...this.inline(S.group() ?? '')); continue }
      if (name === 'verb') { const d = S.s[S.i++]; put({ t: 'code', c: [{ t: 'text', s: S.until(d) }] }); continue }
      if (name === 'textcolor' || name === 'colorbox' || name === 'highlight') { S.opt(); S.group(); continue }
      if (name === 'SI' || name === 'qty') {
        S.opt()
        const v = S.group() ?? '', unit = (S.group() ?? '').replace(/\\per\b/g, '/').replace(/\\([A-Za-z]+)/g, ' $1')
        text += `${v} ${unit.trim()}`
        continue
      }
      if (name === 'num') { S.opt(); text += S.group() ?? ''; continue }
      if (name in WORDS) { text += WORDS[name]; if (/^[A-Za-z]/.test(name) && S.s.startsWith('{}', S.i)) S.i += 2; continue }
      if (name in SKIP) { for (let k = 0; k < SKIP[name]; k++) { S.opt(); S.group() } S.opt(); continue }
      const m = this.macros[name]
      if (m && this.depth < 20) {
        const args: string[] = []
        if (m.def !== null) args.push(S.opt() ?? m.def)
        while (args.length < m.args) args.push(S.arg())
        const body = m.body.replace(/#(\d)/g, (_, d) => args[Number(d) - 1] ?? '')
        this.depth++
        put(...this.inline(body))
        this.depth--
        continue
      }
      // anything else: its words stay (a group right after it is read as text)
    }
    put()
    return out
  }
}

function trim(c: Inline[]): Inline[] {
  const out = [...c]
  const first = out[0], last = out[out.length - 1]
  if (first?.t === 'text') out[0] = { t: 'text', s: first.s.replace(/^\s+/, '') }
  if (last?.t === 'text') out[out.length - 1] = { t: 'text', s: (out[out.length - 1] as { s: string }).s.replace(/\s+$/, '') }
  return out.filter((x) => x.t !== 'text' || x.s)
}

/** Where a definition (\newcommand{\a}[1]{…}) that starts at i ends. */
function defEnd(s: string, i: number): number {
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

// -- references ----------------------------------------------------------------------------------------------------
function bibitems(body: string): { key: string; label: string; text: string }[] {
  const [, ...items] = splitTop(body, '\\bibitem')
  return items.map((raw, k) => {
    const S = new Src(raw)
    const opt = S.opt()
    const key = (S.group() ?? '').trim()
    const text = S.s.slice(S.i).replace(/\\newblock\b/g, ' ').replace(/\\bibinfo\s*\{[^}]*\}/g, '')
      .replace(/\\bibfield\s*\{[^}]*\}/g, '').replace(/\\(BibitemOpen|BibitemShut\s*\{[^}]*\}|urlprefix|doiprefix)/g, '')
      .replace(/\\providecommand.*$/gm, '')
    // natbib's [Doe et al.(2023)Doe, Lee]: Doe et al. (2023)
    const label = opt ? opt.replace(/\)([^)]*)$/, ')').replace(/\(/, ' (').replace(/\s+/g, ' ').trim() : String(k + 1)
    return { key, label, text }
  })
}

/** The cited entries of .bib files, as bibitems: Authors. Title. Journal, year. */
export function fromBib(bibs: string[], cited: string[]): { key: string; label: string; text: string }[] {
  const entries = new Map<string, Record<string, string>>()
  for (const bib of bibs) {
    for (let i = bib.indexOf('@'); i >= 0; i = bib.indexOf('@', i + 1)) {
      const open = bib.indexOf('{', i)
      if (open < 0) break
      const type = bib.slice(i + 1, open).trim().toLowerCase()
      if (type === 'comment' || type === 'string' || type === 'preamble') continue
      const end = closing(bib, open)
      const body = bib.slice(open + 1, end)
      const comma = body.indexOf(',')
      const key = body.slice(0, comma).trim()
      const fields: Record<string, string> = {}
      const S = new Src(body.slice(comma + 1))
      while (!S.done) {
        const m = /\s*,?\s*([A-Za-z_-]+)\s*=\s*/y
        m.lastIndex = S.i
        const hit = m.exec(S.s)
        if (!hit) break
        S.i = m.lastIndex
        let v = ''
        if (S.s[S.i] === '{') v = S.group() ?? ''
        else if (S.s[S.i] === '"') { S.i++; v = S.until('"') } else { const w = /[^,]*/y; w.lastIndex = S.i; v = w.exec(S.s)![0]; S.i = w.lastIndex }
        fields[hit[1].toLowerCase()] = v.replace(/\s+/g, ' ').trim()
      }
      entries.set(key, fields)
      i = end
    }
  }
  return cited.filter((k) => entries.has(k)).map((key, k) => {
    const f = entries.get(key)!
    const names = (f.author ?? f.editor ?? '').split(/\s+and\s+/).filter(Boolean)
    const who = names.length > 2 ? `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}` : names.join(' and ')
    const where = f.journal ?? f.booktitle ?? f.publisher ?? f.school ?? f.institution ?? f.howpublished ?? ''
    const text = [who, f.title, [where, f.year].filter(Boolean).join(', ')].filter(Boolean)
      .map((x) => x.replace(/[.\s]+$/, '')).join('. ') + '.'
    return { key, label: String(k + 1), text: text.replace(/[{}]/g, '') }
  })
}

// -- the whole paper -------------------------------------------------------------------------------------------------
const dir = (p: string) => p.slice(0, p.lastIndexOf('/') + 1)

/** main.tex with its \input and \include files in place. */
export async function gather(read: Read, main: string): Promise<string> {
  const root = dir(main)
  const expand = async (text: string, depth: number): Promise<string> => {
    const clean = stripComments(text)
    if (depth > 6) return clean
    const parts: string[] = []
    let last = 0
    for (const m of clean.matchAll(/\\(input|include|subfile)\s*\{([^}]+)\}/g)) {
      parts.push(clean.slice(last, m.index))
      last = m.index! + m[0].length
      const name = m[2].trim()
      const path = (name.startsWith('/') ? name : root + name).replace(/(^|\/)\.\//g, '$1')
      const file = /\.\w+$/.test(name) ? path : `${path}.tex`
      try { parts.push(await expand(await read(file), depth + 1)) } catch { /* a missing file reads as nothing */ }
    }
    parts.push(clean.slice(last))
    return parts.join('')
  }
  return expand(await read(main), 0)
}

/** Parses a whole paper. bbl: the compiled bibliography (main.bbl), else .bib files are read for \cite. */
export async function loadLatex(read: Read, main: string): Promise<Doc> {
  const all = await gather(read, main)
  const begin = all.indexOf('\\begin{document}')
  const pre = begin >= 0 ? all.slice(0, begin) : ''
  const body = begin >= 0 ? all.slice(begin + 16, all.indexOf('\\end{document}') >>> 0) : all
  const p = new Paper()
  p.define(pre)
  p.chapters = /\\chapter\*?\s*[[{]/.test(body)
  try {
    const bbl = await read(main.replace(/\.tex$/, '') + '.bbl')
    const env = bbl.match(/\\begin\{thebibliography\}\s*\{[^}]*\}([\s\S]*?)\\end\{thebibliography\}/)
    if (env) p.bib = bibitems(env[1])
  } catch { /* not built yet, or no bibliography */ }
  const names = [...body.matchAll(/\\(?:bibliography|addbibresource)\s*\{([^}]+)\}/g), ...pre.matchAll(/\\addbibresource\s*\{([^}]+)\}/g)]
    .flatMap((m) => m[1].split(',')).map((n) => n.trim()).filter(Boolean)
  let bibs: string[] = []
  if (!p.bib.length && names.length) {
    bibs = await Promise.all(names.map((n) => read(dir(main) + (n.endsWith('.bib') ? n : `${n}.bib`)).catch(() => '')))
    // the keys cited come from a first look at the text, so the list is in citing order
    for (const m of body.matchAll(/\\(?:cite[a-z]*|parencite|textcite|autocite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/g)) {
      for (const k of m[1].split(',').map((x) => x.trim())) if (k && !p.cited.includes(k)) p.cited.push(k)
    }
    p.bib = fromBib(bibs, p.cited)
  }
  const blocks = p.blocks(body)
  if (p.bib.length && !blocks.some((b) => b.t === 'refs')) {
    blocks.push({ t: 'h', level: 1, num: '', c: [{ t: 'text', s: 'References' }] }, p.refs())
  }
  const cites: Record<string, string> = {}
  p.bib.forEach((b) => { cites[b.key] = b.label })
  p.cited.forEach((k, i) => { cites[k] ??= p.bib.length ? '?' : String(i + 1) })
  return { blocks, from: 'source', labels: p.labels, cites, macros: p.katexMacros() }
}

/** Math as KaTeX takes it: \ref and \eqref become their numbers, labels go. */
export function mathFor(tex: string, labels: Doc['labels']): string {
  return tex.replace(/\\(eqref|ref|cref|Cref|autoref)\s*\{([^}]*)\}/g, (_, how: string, key: string) => {
    const l = labels[key.trim()]
    const n = l ? l.num : '??'
    return `\\text{${how === 'eqref' ? `(${n})` : n}}`
  }).replace(/\\label\s*\{[^}]*\}/g, '').replace(/\\intertext\s*\{/g, '\\text{')
}
