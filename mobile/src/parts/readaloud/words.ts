// The words of a PDF for the phone's voice, out of pdf.js's text runs: each with its box (PDF points from the
// page's top left, as the viewer draws them) and what is said for it, then cut into sentences.
import type { PDFDocumentProxy } from 'pdfjs-dist'

export type Word = {
  page: number  // 1-based
  text: string
  say: string  // what the voice says: '' for symbols, the whole word for the first half of a hyphenated one
  box: [number, number, number, number]  // x0, y0, x1, y1
  size: number  // font size, to tell a heading from its paragraph
}

type Item = { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }

const SPEAKABLE = /[\p{L}\p{N}]/u
const SENTENCE_ENDS = /[.!?…]$/
const CLOSERS = /["')\]”’]+$/
const LONGEST = 60  // words in one sentence, at most (a list or a table with no full stops)

let ruler: CanvasRenderingContext2D | null | undefined
/** How wide a run's start is, as a share of the whole run (a font's letters are not all as wide). */
function share(str: string, at: number) {
  if (ruler === undefined) ruler = document.createElement('canvas').getContext('2d')
  if (!ruler || !str.length) return at / Math.max(1, str.length)
  ruler.font = '100px sans-serif'
  const whole = ruler.measureText(str).width
  return whole ? ruler.measureText(str.slice(0, at)).width / whole : at / str.length
}

/** Every word in reading order. progress: pages done so far. stop() true: give up (the PDF changed). */
export async function pdfWords(doc: PDFDocumentProxy, progress: (done: number) => void,
  stop: () => boolean): Promise<Word[]> {
  const out: Word[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    if (stop()) return []
    const page = await doc.getPage(p)
    const [left, , , top] = page.view
    let last: { word: Word; end: number; y: number; gap: boolean } | null = null
    for (const it of (await page.getTextContent()).items as Item[]) {
      if (!it.str) continue
      const [a, b, , d, e, f] = it.transform
      const size = Math.hypot(a, b) || Math.abs(d)
      for (const m of it.str.matchAll(/\S+/g)) {
        const i = m.index!
        const x0 = e - left + share(it.str, i) * it.width, x1 = e - left + share(it.str, i + m[0].length) * it.width
        // a word pdf.js cut in two (kerning, a ligature): the second part right after the first on the same line
        if (i === 0 && last && !last.gap && Math.abs(last.y - f) < size * 0.3 && x0 - last.end < size * 0.15) {
          last.word.text += m[0]
          last.word.box[2] = Math.max(last.word.box[2], x1)
        } else {
          out.push({ page: p, text: m[0], say: '', box: [x0, top - f - size * 0.8, x1, top - f + size * 0.2], size })
        }
        last = { word: out[out.length - 1], end: x1, y: f, gap: i + m[0].length < it.str.length || !!it.hasEOL }
      }
      if (last && /\s$/.test(it.str)) last.gap = true
    }
    progress(p)
  }
  for (const w of out) w.say = SPEAKABLE.test(w.text) ? w.text.normalize('NFKC') : ''
  out.forEach((w, i) => {  // a page number on a line of its own, at the top or the bottom of a page
    const before = out[i - 1], after = out[i + 1]
    const alone = (!before || newLine(before, w)) && (!after || newLine(w, after))
    if (alone && /^\d{1,4}$/.test(w.text) && (before?.page !== w.page || after?.page !== w.page)) w.say = ''
  })
  for (let i = 0; i + 1 < out.length; i++) {  // "exam-" at a line's end and "ple" on the next: one word said
    const w = out[i], n = out[i + 1]
    if (w.say.length > 2 && w.say.endsWith('-') && newLine(w, n) && /^\p{Ll}/u.test(n.say)) {
      w.say = w.say.slice(0, -1) + n.say
      n.say = ''
    }
  }
  return out
}

function newLine(a: Word, b: Word) {
  return a.page !== b.page || Math.abs(a.box[3] - b.box[3]) > a.size * 0.5
}

function endsSentence(text: string) {
  const t = text.replace(CLOSERS, '')
  return t.length > 1 && SENTENCE_ENDS.test(t)
}

/** Where each sentence starts (word indexes, the first is 0): at full stops, and between a heading or a
 *  paragraph and what follows (a wide gap between lines, or another font size). */
export function sentences(words: Word[]): number[] {
  const starts = words.length ? [0] : []
  let count = 0
  for (let i = 0; i + 1 < words.length; i++) {
    const w = words[i], n = words[i + 1]
    if (w.say) count++
    const gap = w.page === n.page && n.box[3] - w.box[3] > w.size * 1.8
    const font = newLine(w, n) && Math.abs(n.size - w.size) > w.size * 0.15
    if (endsSentence(w.text) || gap || font || count >= LONGEST) {
      starts.push(i + 1)
      count = 0
    }
  }
  return starts
}
