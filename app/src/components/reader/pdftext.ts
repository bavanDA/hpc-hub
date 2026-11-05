// A PDF's text as the Reader's blocks (pdf.js, on this computer): lines from the text runs, then headings by size and
// weight, paragraphs by gaps and indents, display math cut from the page as pictures. Also each page's words, to
// find where the LaTeX source's blocks fall in the PDF.
import type { PDFDocumentProxy } from 'pdfjs-dist'

import type { Block, Box, Doc, Inline } from './model'
import { plain } from './model'

type Run = { s: string; x: number; y: number; w: number; size: number; font: string }
type Line = { page: number; x0: number; x1: number; y: number; top: number; bottom: number; size: number
  text: string; math: number; bold: boolean; tag: string; tagX: number }
type Item = { str: string; transform: number[]; width: number; fontName: string; hasEOL?: boolean }

const MATH_FONT = /CMMI|CMSY|CMEX|MSAM|MSBM|EUFM|EUSM|RSFS|STIXMath|CambriaMath|Math|LMMath|TeXGyre.*Math|cmmi|cmsy|cmex|msbm/
const BOLD_FONT = /Bold|CMBX|Black|Heavy|Semibold|SFBX|bx\d/i
const MATH_CHAR = /[∑∏∫√∞≤≥≈≠∈∉⊂⊆∪∩∀∃∂∇±×÷→←↦⇒⇔∧∨¬⊗⊕⟨⟩‖∥𝔼ℝℕℤℚℂ\u{1D400}-\u{1D7FF}=+<>^_|]/u
const TAG = /^\(\s*(?:[A-Z]\.)?\d+(?:\.\d+)*[a-z]?\s*\)$/

export type PdfText = { pages: Line[][]; heights: number[]; body: number; count: number }

/** Every line of every page. */
export async function readText(pdf: PDFDocumentProxy, dead: () => boolean = () => false): Promise<PdfText> {
  const pages: Line[][] = [], heights: number[] = []
  for (let n = 1; n <= pdf.numPages && !dead(); n++) {
    const page = await pdf.getPage(n)
    const [vx, vy0, , vy] = page.view
    heights.push(vy - vy0)
    const content = await page.getTextContent()
    const fonts = new Map<string, string>()
    try {  // the real font names (CMMI10, CMBX12): math and bold
      await page.getOperatorList()
      for (const it of content.items as Item[]) {
        if (it.fontName && !fonts.has(it.fontName)) {
          const f = (page.commonObjs as unknown as { get(id: string): { name?: string } | undefined }).get(it.fontName)
          fonts.set(it.fontName, f?.name ?? '')
        }
      }
    } catch { /* no names: guess from the characters */ }
    const runs: Run[] = []
    for (const it of content.items as Item[]) {
      if (!('str' in it) || !it.str) continue
      const [a, b, c, d, e, f] = it.transform
      const size = Math.hypot(c, d) || Math.hypot(a, b)
      runs.push({ s: it.str, x: e - vx, y: vy - f, w: it.width, size, font: fonts.get(it.fontName) ?? '' })
    }
    pages.push(lines(runs, n))
    page.cleanup()
  }
  const sizes = new Map<number, number>()
  for (const l of pages.flat()) {
    const k = Math.round(l.size * 2) / 2
    sizes.set(k, (sizes.get(k) ?? 0) + l.text.length)
  }
  const body = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10
  return { pages, heights, body, count: pdf.numPages }
}

function lines(runs: Run[], page: number): Line[] {
  const out: Line[] = []
  let cur: (Line & { chars: number; boldChars: number; mathChars: number; main: number }) | null = null
  const finish = () => {
    if (!cur || !cur.text.trim()) { cur = null; return }
    const symbols = [...cur.text].filter((ch) => MATH_CHAR.test(ch) || /[\p{Script=Greek}²³¹⁰-⁹₀-₉]/u.test(ch)).length
    const words = cur.text.match(/[A-Za-z]{4,}/g)?.length ?? 0
    const mathy = cur.mathChars > 0 || symbols >= 2 && words <= 2
    const parts = cur.text.trimEnd().match(/^(.*\S)\s+(\([^()]*\))$/)
    if (parts && TAG.test(parts[2]) && mathy) {
      cur.text = parts[1]
      cur.tag = parts[2]
      cur.tagX ||= cur.x1 - (parts[2].length + 1) * cur.size * 0.5
    }
    cur.text = cur.text.trim()
    cur.math = Math.max(cur.mathChars / Math.max(1, cur.chars), symbols >= 2 && words <= 2 ? 1 : 0)
    cur.bold = cur.boldChars > cur.chars / 2
    out.push(cur)
    cur = null
  }
  for (const r of runs) {
    const most = cur ? Math.max(r.size, cur.size) : 0, dy = cur ? Math.abs(r.y - cur.y) : 0
    // the next run on this line; raised or lowered ones (a root sign, a superscript) right after it too
    const same = cur && (dy < 0.65 * most && r.x >= cur.x1 - cur.size * 0.8 ||
      dy < 1.1 * most && r.x >= cur.x1 - cur.size * 0.3 && r.x <= cur.x1 + cur.size * 3)
    if (!same) {
      finish()
      cur = { page, x0: r.x, x1: r.x, y: r.y, top: r.y - r.size, bottom: r.y + r.size * 0.25, size: r.size, text: '',
        math: 0, bold: false, tag: '', tagX: 0, chars: 0, boldChars: 0, mathChars: 0, main: 0 }
    }
    const c = cur!
    const gap = r.x - c.x1
    if (c.text && gap > r.size * 0.15 && !/\s$/.test(c.text) && !/^\s/.test(r.s)) c.text += ' '
    if (TAG.test(r.s.trim()) && gap > r.size * 2) c.tagX = r.x
    c.text += r.s
    const n = r.s.replace(/\s/g, '').length
    c.chars += n
    if (MATH_FONT.test(r.font) || MATH_CHAR.test(r.s) && n <= 3) c.mathChars += n
    if (BOLD_FONT.test(r.font)) c.boldChars += n
    if (n > c.main) { c.main = n; c.size = r.size; c.y = r.y }
    c.x1 = Math.max(c.x1, r.x + r.w)
    c.x0 = Math.min(c.x0, r.x)
    c.top = Math.min(c.top, r.y - r.size * 0.8)
    c.bottom = Math.max(c.bottom, r.y + r.size * 0.3)
  }
  finish()
  return out
}

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')

/** Each page's words, squeezed: for finding text in it. */
export function pageWords(t: PdfText): string[] {
  return t.pages.map((ls) => norm(ls.map((l) => l.text).join(' ')))
}

/** The blocks of a PDF. */
export function fromPdf(t: PdfText): Doc {
  const { body } = t
  const all = t.pages.flat()
  // running heads and page numbers: short lines at the very top or bottom, or the same words on many pages
  const seen = new Map<string, number>()
  for (const l of all) {
    const k = norm(l.text).replace(/\d+/g, '')
    seen.set(k, (seen.get(k) ?? 0) + 1)
  }
  const edge = (l: Line) => (l.top < t.heights[l.page - 1] * 0.08 || l.bottom > t.heights[l.page - 1] * 0.9) &&
    l.text.length < 90 &&
    (/^[\divxlc.\s-]+$/i.test(l.text) || (seen.get(norm(l.text).replace(/\d+/g, '')) ?? 0) >= 3)
  const pages = t.pages.map((ls) => ls.filter((l) => !edge(l)))

  // where each page's columns start and end: the lefts and rights many lines share
  const columns = pages.map((ls) => {
    const count = (vals: number[]) => {
      const m = new Map<number, number>()
      for (const v of vals) m.set(Math.round(v / 2) * 2, (m.get(Math.round(v / 2) * 2) ?? 0) + 1)
      return [...m].filter(([, c]) => c >= 3).map(([v]) => v).sort((a, b) => a - b)
    }
    return { lefts: count(ls.map((l) => l.x0)), rights: count(ls.map((l) => l.x1)),
      mid: ls.length ? (Math.min(...ls.map((l) => l.x0)) + Math.max(...ls.map((l) => l.x1))) / 2 : 0 }
  })
  // words inside figures (axis labels, legends): small, short, and not where a column's lines start
  const kept = pages.map((ls) => ls.filter((l) => {
    if (l.size >= body * 0.86 || l.text.length >= 60) return true
    const left = [...columns[l.page - 1].lefts].reverse().find((v) => v <= l.x0 + 2) ?? l.x0
    return l.x0 <= left + l.size * 1.5 && l.text.length > 25
  }))
  const colOf = (l: Line) => {
    const c = columns[l.page - 1]
    const left = [...c.lefts].reverse().find((v) => v <= l.x0 + 2) ?? l.x0
    const right = c.rights.find((v) => v >= l.x1 - 2) ?? l.x1
    return { left, right }
  }

  const headSizes = [...new Set(all.filter((l) => l.size >= body * 1.12 && l.text.length < 160)
    .map((l) => Math.round(l.size)))].sort((a, b) => b - a)
  const numbered = /^((\d+|[A-Z])(\.\d+)*\.?)\s+(\S.*)$/

  const blocks: Block[] = []
  let para: { lines: Line[]; small: boolean } | null = null
  let math: { page: number; box: Box; tag: string; last: Line } | null = null
  let prev: Line | null = null
  let titled = false
  let byOpen = false  // the lines under the title: authors, places, the date
  const levels = new Map<number, number>()  // a heading size: the level numbered headings of that size have
  const endPara = () => {
    if (!para) return
    let text = ''
    for (const l of para.lines) {
      if (/[\p{L}]-$/u.test(text) && /^\p{Ll}/u.test(l.text)) text = text.slice(0, -1) + l.text
      else text += (text ? ' ' : '') + l.text
    }
    blocks.push({ t: 'p', c: [{ t: 'text', s: text }], small: para.small || undefined, page: para.lines[0].page })
    para = null
  }
  const endMath = () => {
    if (!math) return
    blocks.push({ t: 'cut', box: math.box, tag: math.tag || undefined, page: math.page })
    math = null
  }

  for (const ls of kept) {
    for (const l of ls) {
      const { left, right } = colOf(l)
      const rank = headSizes.indexOf(Math.round(l.size))
      const m = l.text.match(numbered)
      const centered = l.x0 > left + body * 1.5 && Math.abs((l.x0 - left) - (right - (l.tagX || l.x1))) < body * 6
      const isMath = (l.math > 0.35 || !!l.tag) && (centered || l.x0 > left + body * 2) && !/[.:]\s*$/.test(l.text) &&
        l.x1 - l.x0 > body * 2.5
      if (isMath) {
        endPara()
        const x1 = l.tagX ? l.tagX - body * 0.5 : l.x1
        const near = math && math.page === l.page && l.top - math.last.bottom < body * 1.2
        if (math && near) {
          math.box = [Math.min(math.box[0], l.x0), Math.min(math.box[1], l.top), Math.max(math.box[2], x1),
            Math.max(math.box[3], l.bottom)]
          math.tag ||= l.tag
          math.last = l
        } else {
          endMath()
          math = { page: l.page, box: [l.x0, l.top, x1, l.bottom], tag: l.tag, last: l }
        }
        prev = l
        continue
      }
      endMath()
      // the title: the biggest words at the top of the first page
      if (!titled && l.page === 1 && l.size >= body * 1.4 && rank === 0) {
        endPara()
        const last = blocks.at(-1)
        if (last?.t === 'title' && prev && l.top - prev.bottom < l.size) {
          (last.c[0] as { s: string }).s += ` ${l.text}`
        } else blocks.push({ t: 'title', c: [{ t: 'text', s: l.text }], by: [], page: 1 })
        byOpen = true
        prev = l
        continue
      }
      const middle = Math.abs((l.x0 + l.x1) / 2 - columns[l.page - 1].mid) < body * 2
      if (byOpen && l.page === 1 && middle && !m && !/^abstract$/i.test(l.text) && l.text.length < 200) {
        const title = blocks.findLast((b) => b.t === 'title') as Extract<Block, { t: 'title' }>
        const near = prev && l.top - prev.bottom < l.size * 0.8
        title.by.push({ t: 'text', s: title.by.length ? (near ? ' ' : ' · ') + l.text : l.text })
        prev = l
        continue
      }
      byOpen = false
      const big = rank >= 0 && l.text.length < 160 && l.size >= body * 1.12
      const boldHead = l.bold && m && l.text.length < 120 && !/[.,;]$/.test(l.text) && l.size >= body * 0.98
      const boldShort = l.bold && l.text.length < 40 && !/[.,;:]$/.test(l.text) && middle
      if (big || boldHead || boldShort) {
        endPara()
        if (blocks.some((b) => b.t === 'title')) titled = true
        const last = blocks.at(-1)
        // a heading on two lines
        if (last?.t === 'h' && !m && prev && l.top - prev.bottom < l.size * 0.8 &&
          Math.round(prev.size) === Math.round(l.size)) {
          (last.c[0] as { s: string }).s += ` ${l.text}`
        } else {
          const size = Math.round(l.size)
          const level = m ? Math.min(4, m[1].replace(/\.$/, '').split('.').length) : levels.get(size) ?? (big ? Math.max(1, Math.min(3, rank + 1)) : 3)
          if (m && !levels.has(size)) levels.set(size, level)
          blocks.push({ t: 'h', level, num: m ? m[1].replace(/\.$/, '') : '', c: [{ t: 'text', s: m ? m[4] : l.text }],
            page: l.page })
        }
        prev = l
        continue
      }
      const small = l.size < body * 0.86
      const p = prev
      const gap = p && p.page === l.page ? l.top - p.bottom : 0
      const breaks = !para || !p || small !== para.small || gap > l.size * 0.9 ||
        l.x0 > left + l.size * 0.8 && l.x0 < left + l.size * 4 &&
          !(p.x1 >= colOf(p).right - p.size * 1.5 && !/[.!?:]["”’)]?$/.test(p.text)) ||
        p.x1 < colOf(p).right - p.size * 3 && /[.!?:]["”’)]?$/.test(p.text)
      if (breaks) { endPara(); para = { lines: [], small } }
      para!.lines.push(l)
      prev = l
    }
  }
  endPara()
  endMath()
  return { blocks, from: 'pdf', labels: {}, cites: {}, macros: {} }
}

/** Puts a page on each of the source's blocks, by finding their first words in the PDF's pages. */
export function place(blocks: Block[], words: string[]) {
  const starts: number[] = []
  let all = ''
  for (const w of words) { starts.push(all.length); all += w }
  const pageAt = (i: number) => { let p = 0; while (p + 1 < starts.length && starts[p + 1] <= i) p++; return p + 1 }
  let cursor = 0, page = 1
  for (const b of blocks) {
    const probe = probeOf(b)
    if (probe) {
      let at = all.indexOf(probe, cursor)
      if (at < 0 || at - cursor > 60000) at = all.indexOf(probe.slice(0, 14), cursor)
      if (at >= 0 && at - cursor < 60000) { cursor = at; page = pageAt(at) }
    }
    b.page = page
  }
}

function probeOf(b: Block): string {
  const text = (c: Inline[]) => {
    const runs: string[] = []
    let cur = ''
    for (const x of c) {
      if (x.t === 'text' || x.t === 'em' || x.t === 'b' || x.t === 'sc' || x.t === 'code') cur += plain([x])
      else { runs.push(cur); cur = '' }
    }
    runs.push(cur)
    return norm(runs.find((r) => norm(r).length >= 12) ?? '')
  }
  if (b.t === 'h') return norm(b.num + plain(b.c)).slice(0, 28)
  if (b.t === 'p' || b.t === 'caption') return text(b.c).slice(0, 24)
  if (b.t === 'title') return norm(plain(b.c)).slice(0, 24)
  if (b.t === 'box') return b.c.length ? probeOf(b.c[0]) : ''
  if (b.t === 'list') return b.items[0]?.c[0] ? probeOf(b.items[0].c[0]) : ''
  return ''
}

// -- math cut from the page ----------------------------------------------------------------------------------------
const cuts = new Map<string, Promise<string>>()

/** A region of a page drawn on a transparent canvas, as a data URL (black ink: used as a mask, so it takes the text
 *  color). scale: canvas pixels per PDF point. */
export function cut(pdf: PDFDocumentProxy, page: number, box: Box, scale: number): Promise<string> {
  const key = `${pdf.fingerprints[0]}:${page}:${box.join(',')}:${scale}`
  let got = cuts.get(key)
  if (!got) {
    got = (async () => {
      const p = await pdf.getPage(page)
      const pad = 2
      const [x0, y0, x1, y1] = [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad]
      const viewport = p.getViewport({ scale, offsetX: -x0 * scale, offsetY: -y0 * scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil((x1 - x0) * scale)
      canvas.height = Math.ceil((y1 - y0) * scale)
      await p.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport, background: 'rgba(0,0,0,0)',
        annotationMode: 0 } as Parameters<typeof p.render>[0]).promise
      return canvas.toDataURL('image/png')
    })()
    cuts.set(key, got)
    if (cuts.size > 400) cuts.delete(cuts.keys().next().value!)
  }
  return got
}
