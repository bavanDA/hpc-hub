import type { Block, Doc, Inline } from '../model'
import { bibitems } from './bib'
import { defEnd, envSpan, LETTER, splitTop, Src } from './scan'
import { ACCENTS, CITES, CODE, DECLARED, DISPLAY, FLOATS, letters, LISTS, REFS, SKIP, SKIP_ENVS, STYLES, THEOREMS,
  WORDS, type Macro, type Theorem } from './vocab'

export class Paper {
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
