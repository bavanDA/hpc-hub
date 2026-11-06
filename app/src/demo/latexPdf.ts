// Typesets the demo paper into a real PDF in the browser, keeping where each line landed for SyncTeX.
type Placed = { file: string; line: number; page: number; x: number; y: number }
type Typeset = { pdf: Uint8Array; placed: Placed[]; log: string; ok: boolean;
  issues: { file: string; line: number; message: string; level: 'error' | 'warning' | 'box' }[] }

const W = 612, H = 792, LEFT = 126, WIDTH = 360, TOP = 96, BOTTOM = 700
// Times-Roman widths (per 1000 em), from its AFM
const TIMES: Record<string, number> = { ' ': 250, '!': 333, '"': 444, '%': 833, '&': 778, "'": 333, '(': 333,
  ')': 333, '+': 564, ',': 250, '-': 333, '.': 250, '/': 278, ':': 278, ';': 278, '=': 564, '?': 444, '[': 333,
  ']': 333, '<': 564, '>': 564, '\x95': 350, a: 444, b: 500, c: 444, d: 500, e: 444, f: 333, g: 500, h: 500, i: 278,
  j: 278, k: 500, l: 278, m: 778, n: 500, o: 500, p: 500, q: 500, r: 333, s: 389, t: 278, u: 500, v: 500, w: 722,
  x: 500, y: 500, z: 444, A: 722, B: 667, C: 667, D: 722, E: 611, F: 556, G: 722, H: 722, I: 333, J: 389, K: 722,
  L: 611, M: 889, N: 722, O: 722, P: 556, Q: 722, R: 667, S: 556, T: 611, U: 722, V: 722, W: 944, X: 722, Y: 722,
  Z: 611 }
type Font = 'R' | 'B' | 'I' | 'H'
const FONT_NAMES: Record<Font | 'S', string> = { R: 'Times-Roman', B: 'Times-Bold', I: 'Times-Italic', H: 'Helvetica',
  S: 'Symbol' }

function width(text: string, font: Font, size: number): number {
  const k = font === 'B' ? 1.05 : font === 'I' ? 0.97 : font === 'H' ? 1.1 : 1
  let w = 0
  for (const ch of text) w += TIMES[ch] ?? (ch >= '0' && ch <= '9' ? 500 : 500)
  return (w * k * size) / 1000
}

// -- LaTeX to plain text (the few commands the demo paper uses) ------------------------------------------------
const KNOWN = new Set(['documentclass', 'usepackage', 'title', 'author', 'date', 'begin', 'end', 'maketitle',
  'section', 'subsection', 'label', 'ref', 'cite', 'emph', 'textbf', 'textit', 'item', 'includegraphics', 'caption',
  'centering', 'input', 'bibliography', 'bibliographystyle', 'today', 'times', 'leq', 'geq', 'approx', 'log', 'sum',
  'alpha', 'beta', 'lambda', 'sigma', 'mathcal', 'frac', 'left', 'right', 'quad', 'cdot', 'top', 'mathrm', 'ell',
  'eqref', 'url', 'footnote', 'newpage', 'hat', 'mathbf', 'in', 'infty', 'min', 'max', 'sqrt', 'partial', 'to',
  'sim', 'linewidth'])
const SYMBOLS: Record<string, string> = { times: '\u00d7', leq: '<=', geq: '>=', approx: '~', cdot: '\u00b7',
  quad: '  ', alpha: '\u03b1', beta: '\u03b2', lambda: '\u03bb', sigma: '\u03c3', sum: '\u03a3', ell: 'l',
  in: ' in ', infty: 'inf', to: '->', top: 'T', sim: '~' }
// Greek letters come from the Symbol font, by these codes
const GREEK: Record<string, string> = { '\u03b1': 'a', '\u03b2': 'b', '\u03bb': 'l', '\u03c3': 's', '\u03a3': 'S' }

type Ctx = { labels: Record<string, string>; cites: string[]; bib: Record<string, string>; file: string;
  unknown: [string, string, number][]; missing: [string, string, number][] }

function plain(src: string, ctx: Ctx, line: number): string {
  let s = src.replace(/(^|[^\\])%.*$/, '$1')
  s = s.replace(/\\cite\{([^}]*)\}/g, (_, keys: string) => '[' + keys.split(',').map((k) => {
    k = k.trim()
    if (!ctx.bib[k]) ctx.missing.push([k, ctx.file, line])
    if (!ctx.cites.includes(k)) ctx.cites.push(k)
    return ctx.bib[k] ? String(ctx.cites.indexOf(k) + 1) : '?'
  }).join(', ') + ']')
  s = s.replace(/\\(?:eq)?ref\{([^}]*)\}/g, (_, k: string) => ctx.labels[k] ?? '??')
  s = s.replace(/\\(?:emph|textbf|textit|mathrm|mathbf|mathcal|hat|url)\{([^}]*)\}/g, '$1')
  s = s.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2').replace(/\^\{?2\}?/g, '\u00b2')
  s = s.replace(/\\label\{[^}]*\}/g, '')
  s = s.replace(/``|''/g, '"').replace(/~/g, ' ').replace(/\\%/g, '%').replace(/\\&/g, '&').replace(/--+/g, '-')
  s = s.replace(/\\([a-zA-Z]+)/g, (_, c: string) => {
    if (!KNOWN.has(c)) ctx.unknown.push([c, ctx.file, line])
    return SYMBOLS[c] ?? (c === 'today' ? 'March 3, 2026' : c === 'log' || c === 'min' || c === 'max' ? c : '')
  })
  return s.replace(/[$^_{}]/g, '').replace(/\\/g, '').replace(/\s+/g, ' ')
}

// -- blocks: what the source says, with where it came from --------------------------------------------------
type Words = { text: string; line: number }[]
type Block =
  | { kind: 'title'; title: string; author: string; date: string; file: string; line: number }
  | { kind: 'abstract' | 'para' | 'item' | 'caption'; words: Words; file: string; line: number }
  | { kind: 'heading'; text: string; file: string; line: number; small?: boolean }
  | { kind: 'equation'; text: string; file: string; line: number }
  | { kind: 'figure'; file: string; line: number }
  | { kind: 'refs'; file: string; line: number }

function parse(files: Record<string, string>, file: string, ctx: Ctx, out: Block[], meta: Record<string, string>) {
  const lines = (files[file] ?? '').split('\n')
  const outer = ctx.file
  ctx.file = file
  let para: Words = [], kind: 'para' | 'abstract' | 'item' = 'para', start = 0, env = '', eq = '', eqLine = 0
  const flush = () => {
    if (para.length) out.push({ kind, words: para, file, line: start })
    para = []
  }
  lines.forEach((raw, i) => {
    const n = i + 1
    const t = raw.replace(/(^|[^\\])%.*$/, '$1').trim()
    const bare = t.replace(/\\label\{[^}]*\}\s*$/, '')
    const cmd = (name: string) => bare.match(new RegExp(`^\\\\${name}\\*?\\{(.*)\\}\\s*$`))?.[1]
    if (env === 'equation') {
      if (t.startsWith('\\end{equation}')) {
        out.push({ kind: 'equation', text: plain(eq, ctx, eqLine), file, line: eqLine })
        env = ''
      } else { eq += ' ' + t; eqLine ||= n }
      return
    }
    if (env === 'figure') {
      const cap = cmd('caption')
      if (cap !== undefined) out.push({ kind: 'caption', words: [{ text: plain(cap, ctx, n), line: n }], file, line: n })
      if (t.startsWith('\\includegraphics')) out.push({ kind: 'figure', file, line: n })
      if (t.startsWith('\\end{figure}')) env = ''
      return
    }
    if (!t) { flush(); kind = env === 'abstract' ? 'abstract' : 'para'; return }
    for (const k of ['title', 'author', 'date']) if (cmd(k) !== undefined) { meta[k] = plain(cmd(k)!, ctx, n); return }
    if (t.startsWith('\\maketitle')) {
      out.push({ kind: 'title', title: meta.title ?? '', author: meta.author ?? '', date: meta.date ?? '', file,
        line: n })
      return
    }
    const sec = cmd('section') ?? cmd('subsection')
    if (sec !== undefined) {
      flush()
      out.push({ kind: 'heading', text: plain(sec, ctx, n), file, line: n,
        small: t.startsWith('\\subsection') })
      return
    }
    const inp = cmd('input')
    if (inp !== undefined) { flush(); parse(files, inp.endsWith('.tex') ? inp : `${inp}.tex`, ctx, out, meta); return }
    if (t.startsWith('\\bibliography{')) { flush(); out.push({ kind: 'refs', file, line: n }); return }
    if (t.startsWith('\\begin{abstract}')) { flush(); env = 'abstract'; kind = 'abstract'; return }
    if (t.startsWith('\\end{abstract}')) { flush(); env = ''; kind = 'para'; return }
    if (t.startsWith('\\begin{equation}')) { flush(); env = 'equation'; eq = ''; eqLine = 0; return }
    if (t.startsWith('\\begin{figure}')) { flush(); env = 'figure'; return }
    if (t.startsWith('\\begin{itemize}') || t.startsWith('\\end{itemize}')) { flush(); kind = 'para'; return }
    if (t.startsWith('\\item')) {
      flush()
      kind = 'item'
      start = n
      para = [{ text: plain(t.slice(5), ctx, n), line: n }]
      return
    }
    if (/^\\(documentclass|usepackage|begin\{document\}|end\{document\}|bibliographystyle|label)/.test(t)) {
      if (t.startsWith('\\end{document}')) flush()
      return
    }
    if (!para.length) start = n
    para.push({ text: plain(t, ctx, n), line: n })
  })
  flush()
  ctx.file = outer
}

/** Numbers for \label: sections, figures and equations, in order. */
function labels(files: Record<string, string>, file: string, out: Record<string, string>, count = { s: 0, f: 0, e: 0 }) {
  let env = ''
  for (const raw of (files[file] ?? '').split('\n')) {
    const t = raw.trim()
    if (/^\\section\{/.test(t)) count.s++
    if (t.startsWith('\\begin{figure}')) { env = 'f'; count.f++ }
    if (t.startsWith('\\begin{equation}')) { env = 'e'; count.e++ }
    if (t.startsWith('\\end{')) env = env && t.match(/\\end\{(figure|equation)\}/) ? '' : env
    const inp = t.match(/^\\input\{(.*)\}/)?.[1]
    if (inp) labels(files, inp.endsWith('.tex') ? inp : `${inp}.tex`, out, count)
    for (const m of t.matchAll(/\\label\{([^}]*)\}/g)) {
      out[m[1]] = String(env === 'f' ? count.f : env === 'e' ? count.e : count.s)
    }
  }
}

function bibliography(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of text.matchAll(/@\w+\{([^,]+),([\s\S]*?)\n\}/g)) {
    const field = (f: string) => m[2].match(new RegExp(`${f}\\s*=\\s*[{"]([^}"]*)[}"]`, 'i'))?.[1]?.trim() ?? ''
    out[m[1].trim()] = [field('author').replace(/ and /g, ', '), field('title'), field('journal') ||
      field('booktitle'), field('year')].filter(Boolean).join('. ') + '.'
  }
  return out
}

// -- layout ------------------------------------------------------------------------------------------------
type Line = { text: string; font: Font; size: number; x: number; y: number; justify?: number }
type Page = { lines: Line[]; ops: string[] }

function wrap(words: string[], first: number, rest: number, font: Font, size: number): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  for (const w of words) {
    const room = out.length ? rest : first
    if (cur.length && width([...cur, w].join(' '), font, size) > room) { out.push(cur); cur = [] }
    cur.push(w)
  }
  if (cur.length) out.push(cur)
  return out
}

export function typeset(files: Record<string, string>, main: string): Typeset {
  const ctx: Ctx = { labels: {}, cites: [], bib: bibliography(files['refs.bib'] ?? ''), file: main, unknown: [],
    missing: [] }
  labels(files, main, ctx.labels)
  const blocks: Block[] = []
  parse(files, main, ctx, blocks, {})
  const pages: Page[] = [{ lines: [], ops: [] }]
  const placed: Placed[] = []
  let y = TOP, eqNo = 0, figNo = 0, secNo = 0, sub = 0, afterHeading = true
  const page = () => pages[pages.length - 1]
  const need = (h: number) => { if (y + h > BOTTOM) { pages.push({ lines: [], ops: [] }); y = TOP } }
  const put = (l: Line, file: string, line: number) => {
    page().lines.push(l)
    placed.push({ file, line, page: pages.length, x: l.x, y: l.y })
  }
  const paragraph = (words: Words, file: string, o: { size: number; indent: number; inset: number; lead: number;
    font?: Font; hang?: number; prefix?: string }) => {
    const font = o.font ?? 'R'
    const flat = words.flatMap((w) => w.text.split(' ').filter(Boolean).map((text) => ({ text, line: w.line })))
    const rows = wrap(flat.map((w) => w.text), WIDTH - 2 * o.inset - o.indent - (o.hang ?? 0),
      WIDTH - 2 * o.inset - (o.hang ?? 0), font, o.size)
    let k = 0
    rows.forEach((row, i) => {
      need(o.lead)
      y += o.lead
      const x = LEFT + o.inset + (o.hang ?? 0) + (i === 0 ? o.indent : 0)
      const room = WIDTH - 2 * o.inset - (o.hang ?? 0) - (i === 0 ? o.indent : 0)
      const text = row.join(' ')
      const gaps = row.length - 1
      const justify = i < rows.length - 1 && gaps ? (room - width(text, font, o.size)) / gaps : 0
      if (i === 0 && o.prefix) put({ text: o.prefix, font, size: o.size, x: LEFT + o.inset, y }, file, flat[k].line)
      put({ text, font, size: o.size, x, y, justify }, file, flat[k].line)
      k += row.length
    })
  }

  for (const b of blocks) {
    if (b.kind === 'title') {
      for (const [text, size, gap] of [[b.title, 17, 0], [b.author, 12, 26], [b.date, 12, 18]] as const) {
        y += gap || 10
        put({ text, font: 'R', size, x: LEFT + (WIDTH - width(text, 'R', size)) / 2, y }, b.file, b.line)
      }
      y += 16
    } else if (b.kind === 'abstract') {
      y += 10
      put({ text: 'Abstract', font: 'B', size: 9, x: LEFT + (WIDTH - width('Abstract', 'B', 9)) / 2, y: y += 4 },
        b.file, b.line)
      paragraph(b.words, b.file, { size: 9, indent: 0, inset: 28, lead: 11 })
      y += 6
    } else if (b.kind === 'heading') {
      need(40)
      y += b.small ? 14 : 20
      const label = b.text === 'References' ? b.text
        : b.small ? `${secNo}.${++sub}   ${b.text}` : `${++secNo}   ${b.text}`
      if (!b.small) sub = 0
      put({ text: label, font: 'B', size: b.small ? 10.5 : 12, x: LEFT, y }, b.file, b.line)
      y += 3
      afterHeading = true
      continue
    } else if (b.kind === 'para' || b.kind === 'item') {
      if (b.kind === 'item') {
        paragraph(b.words, b.file, { size: 10, indent: 0, inset: 0, lead: 12.5, hang: 22, prefix: '   \x95' })
      } else {
        paragraph(b.words, b.file, { size: 10, indent: afterHeading ? 0 : 15, inset: 0, lead: 12.5 })
      }
    } else if (b.kind === 'equation') {
      need(30)
      y += 22
      const no = `(${++eqNo})`
      put({ text: b.text.trim(), font: 'I', size: 10, x: LEFT + (WIDTH - width(b.text.trim(), 'I', 10)) / 2, y },
        b.file, b.line)
      page().lines.push({ text: no, font: 'R', size: 10, x: LEFT + WIDTH - width(no, 'R', 10), y })
      y += 8
    } else if (b.kind === 'figure') {
      need(190)
      y += 14
      plot(page(), LEFT + 40, y, WIDTH - 80, 150)
      placed.push({ file: b.file, line: b.line, page: pages.length, x: LEFT + 40, y: y + 75 })
      y += 172
    } else if (b.kind === 'caption') {
      const words = [{ text: `Figure ${++figNo}: ${b.words[0].text}`, line: b.line }]
      paragraph(words, b.file, { size: 9, indent: 0, inset: 20, lead: 11 })
      y += 8
    } else if (b.kind === 'refs') {
      need(40)
      y += 20
      put({ text: 'References', font: 'B', size: 12, x: LEFT, y }, b.file, b.line)
      y += 4
      ctx.cites.filter((k) => ctx.bib[k]).forEach((k, i) =>
        paragraph([{ text: ctx.bib[k], line: b.line }], b.file, { size: 9, indent: 0, inset: 0, lead: 11, hang: 18,
          prefix: `[${i + 1}]` }))
    }
    afterHeading = false
  }

  const issues: Typeset['issues'] = []
  for (const [c, file, line] of ctx.unknown) {
    issues.push({ file, line, message: `Undefined control sequence \\${c}.`, level: 'error' })
  }
  for (const [k, file, line] of ctx.missing) {
    issues.push({ file, line, message: `Citation \`${k}' undefined`, level: 'warning' })
  }
  const ok = !ctx.unknown.length
  return { pdf: ok ? write(pages) : new Uint8Array(), placed, ok, issues, log: log(main, pages.length, issues, ok) }
}

function plot(p: Page, x: number, top: number, w: number, h: number) {
  const Y = (v: number) => (H - top - h + v).toFixed(1)
  const ops = p.ops
  ops.push('0.85 0.85 0.87 RG 0.5 w')
  for (let i = 1; i < 4; i++) ops.push(`${x} ${Y((h * i) / 4)} m ${x + w} ${Y((h * i) / 4)} l S`)
  ops.push('0.2 0.2 0.2 RG 0.8 w', `${x} ${Y(h)} m ${x} ${Y(0)} l ${x + w} ${Y(0)} l S`)
  const curve = (f: (t: number) => number) => Array.from({ length: 41 }, (_, i) =>
    `${(x + (w * i) / 40).toFixed(1)} ${Y(h * f(i / 40))} ${i ? 'l' : 'm'}`).join(' ') + ' S'
  ops.push('0.21 0.52 0.89 RG 1.6 w []0 d', curve((t) => 0.08 + 0.82 * Math.exp(-t * 4.2)))
  ops.push('0.9 0.38 0 RG 1.6 w [4 3]0 d', curve((t) => 0.16 + 0.76 * Math.exp(-t * 3.4)), '[]0 d')
  p.lines.push({ text: 'train', font: 'H', size: 7, x: x + w - 70, y: top + 14 })
  p.lines.push({ text: 'validation', font: 'H', size: 7, x: x + w - 38, y: top + 14 })
  ops.push('0.21 0.52 0.89 RG 1.6 w', `${x + w - 84} ${Y(h - 12)} m ${x + w - 73} ${Y(h - 12)} l S`)
  ops.push('0.9 0.38 0 RG [4 3]0 d', `${x + w - 52} ${Y(h - 12)} m ${x + w - 41} ${Y(h - 12)} l S`, '[]0 d')
  p.lines.push({ text: 'epoch', font: 'H', size: 7, x: x + w / 2 - 10, y: top + h + 19 })
  p.lines.push({ text: 'loss', font: 'H', size: 7, x: x - 18, y: top + h / 2 })
  for (let i = 0; i <= 4; i++) {
    p.lines.push({ text: String(i * 10), font: 'H', size: 6, x: x + (w * i) / 4 - 3, y: top + h + 9 })
  }
}

function log(main: string, pages: number, issues: Typeset['issues'], ok: boolean): string {
  const base = main.replace(/\.tex$/, '')
  const lines = [
    'Rc files read:', '  /etc/latexmkrc', 'Latexmk: This is Latexmk, John Collins, version 4.83.',
    `Latexmk: applying rule 'pdflatex'...`, `Rule 'pdflatex':  Reasons for rerun`, 'Changed files or newly in use:',
    `  ${main}`, '------------', `Run number 1 of rule 'pdflatex'`, '------------',
    `Running 'pdflatex  -interaction=nonstopmode -file-line-error -synctex=1 -halt-on-error  "${main}"'`,
    'This is pdfTeX, Version 3.141592653-2.6-1.40.26 (TeX Live 2024) (preloaded format=pdflatex)',
    ' restricted \\write18 enabled.', `entering extended mode`, `(./${main}`, 'LaTeX2e <2023-11-01> patch level 1',
    '(/usr/share/texlive/texmf-dist/tex/latex/base/article.cls',
    'Document Class: article 2023/05/17 v1.4n Standard LaTeX document class',
    '(/usr/share/texlive/texmf-dist/tex/latex/base/size10.clo))',
    '(/usr/share/texlive/texmf-dist/tex/latex/amsmath/amsmath.sty)',
    '(/usr/share/texlive/texmf-dist/tex/latex/graphics/graphicx.sty)',
    `(./${base}.aux)`,
  ]
  for (const i of issues) {
    lines.push(i.level === 'error' ? `./${i.file}:${i.line}: ${i.message}`
      : `LaTeX Warning: ${i.message} on input line ${i.line}.`)
  }
  if (ok) {
    lines.push(`[1{/usr/share/texlive/texmf-dist/fonts/map/pdftex/updmap/pdftex.map}] [${
      Array.from({ length: pages - 1 }, (_, i) => i + 2).join('] [')}] (./${base}.aux) )`,
    `Output written on ${base}.pdf (${pages} pages, ${18_400 + pages * 6_100} bytes).`,
    `SyncTeX written on ${base}.synctex.gz.`, `Transcript written on ${base}.log.`,
    `Latexmk: All targets (${base}.pdf) are up-to-date`)
  } else {
    lines.push('!  ==> Fatal error occurred, no output PDF file produced!', `Transcript written on ${base}.log.`,
      `Latexmk: Errors, so I did not complete making targets`)
  }
  return lines.join('\n') + '\n'
}

// -- the PDF file ------------------------------------------------------------------------------------------
function escape(s: string): string {
  return s.replace(/[\\()]/g, (c) => '\\' + c).replace(/[^\x20-\x7e\x95\xa0-\xff]/g, '?')
    .replace(/[\x95\xa0-\xff]/g, (c) => '\\' + c.charCodeAt(0).toString(8))
}

/** Show text, switching to the Symbol font for Greek letters (Tj moves along by itself). */
function show(text: string, font: Font, size: number): string {
  return text.split(/([\u0370-\u03ff])/).filter(Boolean).map((part) => GREEK[part]
    ? `/FS ${size} Tf (${GREEK[part]}) Tj /F${font} ${size} Tf` : `(${escape(part)}) Tj`).join(' ')
}

function write(pages: Page[]): Uint8Array {
  const objs: string[] = []
  const add = (s: string) => { objs.push(s); return objs.length }
  const fonts = (Object.keys(FONT_NAMES) as (Font | 'S')[]).map((f) => [f, add(`<< /Type /Font /Subtype /Type1 ` +
    `/BaseFont /${FONT_NAMES[f]}${f === 'S' ? '' : ' /Encoding /WinAnsiEncoding'} >>`)] as const)
  const fontDict = '<< ' + fonts.map(([f, n]) => `/F${f} ${n} 0 R`).join(' ') + ' >>'
  const pagesId = objs.length + 1
  add('')  // the page tree, filled in below
  const kids: number[] = []
  pages.forEach((p, i) => {
    const text = p.lines.map((l) => `BT /F${l.font} ${l.size} Tf ${(l.justify ?? 0).toFixed(3)} Tw 1 0 0 1 ${
      l.x.toFixed(2)} ${(H - l.y).toFixed(2)} Tm ${show(l.text, l.font, l.size)} ET`)
    const num = String(i + 1)
    text.push(`BT /FR 10 Tf 0 Tw 1 0 0 1 ${(W / 2 - width(num, 'R', 10) / 2).toFixed(2)} 60 Tm (${num}) Tj ET`)
    const stream = ['q', ...p.ops, 'Q', '0 0 0 rg', ...text].join('\n')
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`)
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${content} 0 R ` +
      `/Resources << /Font ${fontDict} >> >>`))
  })
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`
  const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`)
  let out = '%PDF-1.4\n'
  const offsets = objs.map((o, i) => {
    const at = out.length
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
    return at
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` +
    offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Uint8Array.from(out, (c) => c.charCodeAt(0))
}
