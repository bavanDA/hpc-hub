// Read aloud and the dictionary without a network: silence with made-up timings over the demo PDF's words.
import { demoEmit } from './events'
import { demoCall } from './index'

const VOICES = [['en-US-AriaNeural', 'Aria (US, female)'], ['en-US-JennyNeural', 'Jenny (US, female)'],
  ['en-US-AndrewNeural', 'Andrew (US, male)'], ['en-US-BrianNeural', 'Brian (US, male)'],
  ['en-GB-SoniaNeural', 'Sonia (British, female)'], ['en-GB-RyanNeural', 'Ryan (British, male)']]
const PER_WORD = 0.32  // seconds
const RATE = 8000  // samples a second in the quiet WAV

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
let audio: Uint8Array = new Uint8Array()

function base64(b: Uint8Array) {
  let s = ''
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Silence as an 8 kHz, 8-bit mono WAV. */
function quiet(seconds: number): Uint8Array {
  const n = Math.ceil(seconds * RATE), out = new Uint8Array(44 + n), v = new DataView(out.buffer)
  const text = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)))
  text(0, 'RIFF'); v.setUint32(4, 36 + n, true); text(8, 'WAVEfmt '); v.setUint32(16, 16, true)
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, RATE, true); v.setUint32(28, RATE, true)
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); text(36, 'data'); v.setUint32(40, n, true)
  out.fill(128, 44)
  return out
}

type Item = { str: string; transform: number[]; width: number; height: number }

/** Every word of the PDF with its box (PDF points from the page's top left), split out of pdf.js's text runs. */
async function words(bytes: Uint8Array): Promise<number[][]> {
  const { engine, open } = await import('../components/pdf/engine')
  const { lib } = await engine()
  const doc = await open(lib, bytes).promise
  const out: number[][] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const [, , , top] = page.view
    for (const it of (await page.getTextContent()).items as Item[]) {
      if (!it.str?.trim()) continue
      const [a, , , d, e, f] = it.transform, size = Math.abs(d) || Math.abs(a), per = it.width / it.str.length
      for (const m of it.str.matchAll(/\S+/g)) {
        const x0 = e + m.index! * per
        out.push([out.length, p, x0, top - f - size * 0.8, x0 + m[0].length * per, top - f + size * 0.2])
      }
    }
  }
  doc.loadingTask.destroy()
  return out
}

async function start({ page = 1 }: { page?: number }) {
  const id = Math.random().toString(16).slice(2, 10)
  ;(async () => {
    await wait(250)
    demoEmit('readaloud', { id, state: 'starting', text: 'Recording 1 of 3…', error: '', offline: false,
      narration: null, offset: 0, n: 1 })
    const pdf = await demoCall<{ data: string }>('latex.chunk', { offset: 0, length: 64 << 20 })
    const raw = atob(pdf.data), bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
    const ws = await words(bytes)
    const timings = ws.map(([wid], i) => [wid, +(i * PER_WORD).toFixed(3), +((i + 0.85) * PER_WORD).toFixed(3)])
    const duration = ws.length * PER_WORD + 1
    audio = quiet(duration)
    await wait(500)
    demoEmit('readaloud', { id, state: 'full', text: '', error: '', offline: false, offset: 0, n: 2,
      narration: { audio: 'demo', duration, words: ws, timings, mime: 'audio/wav' } })
  })()
  void page
  return { id, state: 'starting', text: 'Getting the voice ready…', error: '', offline: false, narration: null,
    offset: 0, n: 0 }
}

type Sense = { definition: string; example?: string; synonyms?: string[] }
const entry = (word: string, respelling: string, phonetic: string, meanings: [string, Sense[]][]) =>
  ({ word, respelling, phonetic, source: 'Free Dictionary API', error: '', offline: false,
    meanings: meanings.map(([pos, senses]) => ({ pos, senses: senses.map((s) => ({ example: '', synonyms: [], ...s })) })) })

const DICTIONARY: Record<string, ReturnType<typeof entry>> = {
  sparse: entry('sparse', 'SPAHRS', '/spɑːs/', [['adjective', [
    { definition: 'Thinly scattered or distributed; not dense.', example: 'a sparse population',
      synonyms: ['scattered', 'thin', 'scant'] },
    { definition: 'Of a matrix or a model: having mostly zero entries or few connections.',
      example: 'Sparse attention keeps only the links that matter.' }]]]),
  attention: entry('attention', 'uh-TEN-shuhn', '/əˈtɛnʃən/', [['noun', [
    { definition: 'Mental focus on something; notice taken of someone or something.',
      example: 'The talk held our attention.', synonyms: ['notice', 'focus', 'regard'] },
    { definition: 'In machine learning, a way for a model to weigh some parts of its input more than others.',
      example: 'Each station attends to its nearest cells.' }]]]),
  coarse: entry('coarse', 'KORS', '/kɔːs/', [['adjective', [
    { definition: 'Rough or loose in texture or grain.', example: 'coarse sand', synonyms: ['rough', 'grainy'] },
    { definition: 'Made of large parts; not fine or detailed.', example: 'a coarse grid of 100 km cells' }]]]),
  interpolation: entry('interpolation', 'in-tur-puh-LAY-shuhn', '/ɪnˌtɜːpəˈleɪʃən/', [['noun', [
    { definition: 'The estimation of a value between two known values.',
      example: 'Bilinear interpolation fills in the values between grid points.', synonyms: ['estimation'] },
    { definition: 'Something inserted into a text or a conversation.' }]]]),
  station: entry('station', 'STAY-shuhn', '/ˈsteɪʃən/', [['noun', [
    { definition: 'A place where instruments measure and record the weather.', example: 'a rainfall station' },
    { definition: 'A regular stopping place on a public transport route.', example: 'the train station' }]],
  ['verb', [{ definition: 'To put in or assign to a place.', example: 'She was stationed abroad.' }]]]),
  climate: entry('climate', 'KLY-muht', '/ˈklaɪmət/', [['noun', [
    { definition: 'The weather conditions of an area over a long period.', example: 'a mild climate' },
    { definition: 'The general mood or state of affairs.', example: 'the political climate',
      synonyms: ['atmosphere', 'mood'] }]]]),
}
DICTIONARY.stations = DICTIONARY.station

export const answers = {
  'readaloud.voices': { voices: VOICES.map(([id, label]) => ({ id, label })), default: VOICES[0][0] },
  'readaloud.start': start,
  'readaloud.follow': null,
  'readaloud.trace': null,
  'readaloud.stop': null,
  'readaloud.audio': ({ offset = 0, length = 4 << 20 }: { offset?: number; length?: number }) =>
    ({ data: base64(audio.subarray(offset, offset + length)), total: audio.length }),
  'readaloud.lookup': async ({ word }: { word: string }) => {
    await wait(300)
    const key = word.toLowerCase().replace(/[^a-z'-]/g, '')
    return DICTIONARY[key] ?? { word, error: `No definition found for '${key}'`, offline: false }
  },
  'readaloud.say': async () => { await wait(150); return { data: base64(quiet(0.5)), mime: 'audio/wav' } },
}
