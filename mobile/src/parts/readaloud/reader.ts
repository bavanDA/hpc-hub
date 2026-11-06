// Read aloud on the phone, with the phone's own voice (speech.ts): the words come out of the PDF the viewer shows
// (words.ts) and are spoken a sentence at a time, a few queued ahead, so pause, skip and a tap on a word only cut
// the queue and start again from a word. The engine says which word it is on (onRangeStart), and the viewer draws
// that word. Android's voice has no clock, so back and forward go by sentence.
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { call } from '@shared/rpc'
import { playOnce } from '@shared/components/pdf/audio'
import { SPEEDS, type Box, type Narrator, type Spot } from '@shared/components/pdf/narrator'
import { speech, type RawVoice, type SpeechEvent } from './speech'
import { pdfWords, sentences, type Word } from './words'

export type PhoneVoice = { id: string; label: string; short: string; lang: string; offline: boolean; english: boolean }

export type Snapshot = {
  phase: 'off' | 'preparing' | 'ready' | 'error'
  playing: boolean
  text: string  // what is being done, or what went wrong
  page: number  // the page being read
  pages: number
  voice: string
  rate: number
}

const AHEAD = 3  // sentences queued after the one being said
const GUESS_RATE = 14  // characters a second, to follow along when a voice says nothing about its words
const VOICE_KEY = 'phone.readaloud.voice', RATE_KEY = 'phone.readaloud.rate'

function stored(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
function store(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private window */ }
}

// -- the voices ------------------------------------------------------------------------------------------------------
const languages = new Intl.DisplayNames(['en'], { type: 'language' })
const regions = new Intl.DisplayNames(['en'], { type: 'region' })
const own = (navigator.language || 'en').split('-')[0].toLowerCase()

/** "English (United States) 2": the language and country, and a number when the country has more voices. Android
 *  names a voice like en-us-x-iol-local; the same voice over the internet ends in -network and keeps its number. */
function named(list: RawVoice[]): PhoneVoice[] {
  const variant = (v: RawVoice) => v.name.match(/-x-([a-z0-9]+)(?:-(?:local|network))?$/i)?.[1] ?? v.name
  const byLang = new Map<string, string[]>()
  for (const v of list) {
    const k = v.lang.toLowerCase(), all = byLang.get(k) ?? []
    if (!all.includes(variant(v))) all.push(variant(v))
    byLang.set(k, all)
  }
  return list.map((v) => {
    const [lang, region] = v.lang.split('-')
    let language = lang
    try { language = languages.of(lang) ?? lang } catch { /* not a language tag */ }
    let country = region ?? ''
    try { if (region) country = regions.of(region.toUpperCase()) ?? region } catch { /* not a region */ }
    const all = [...(byLang.get(v.lang.toLowerCase()) ?? [])].sort()
    const n = all.length > 1 ? ` ${all.indexOf(variant(v)) + 1}` : ''
    return { id: v.name, lang: v.lang, offline: v.offline, english: lang.toLowerCase() === 'en',
      label: `${language}${country ? ` (${country})` : ''}${n}`,
      short: `${language}${region ? ` (${region.toUpperCase()})` : ''}${n}` }
  }).sort((a, b) => Number(b.offline) - Number(a.offline) || rank(a) - rank(b)
    || a.label.localeCompare(b.label, 'en', { numeric: true }))
}

/** English first, then the phone's own language, then the rest. */
const rank = (v: PhoneVoice) => v.english ? 0 : v.lang.split('-')[0].toLowerCase() === own ? 1 : 2

let voiceList: Promise<{ voices: PhoneVoice[]; default: string }> | null = null

/** The phone's voices, offline ones first, and the one to use when you haven't picked one (English). */
export function phoneVoices() {
  voiceList ??= (async () => {
    const engine = await speech()
    let got = await engine.voices()
    if (!got.voices.length) {  // Android may list its voices a moment after the engine starts
      await new Promise((r) => setTimeout(r, 600))
      got = await engine.voices()
    }
    const voices = named(got.voices)
    const english = voices.filter((v) => v.english && v.offline)
    const fallback = voices.find((v) => v.id === got.default && v.english && v.offline)
      ?? english.find((v) => v.lang.toLowerCase() === 'en-us') ?? english[0] ?? voices.find((v) => v.english)
      ?? voices.find((v) => v.id === got.default) ?? voices[0]
    return { voices, default: fallback?.id ?? '' }
  })().catch((e) => { voiceList = null; throw e })
  return voiceList
}

export function usePhoneVoices(): PhoneVoice[] {
  const [list, setList] = useState<PhoneVoice[]>([])
  useEffect(() => { phoneVoices().then((v) => setList(v.voices)).catch(() => {}) }, [])
  return list
}

// -- the reader -----------------------------------------------------------------------------------------------------
type Spoken = { text: string; offsets: number[]; ids: number[] }  // where each word starts in the text
let readers = 0

export class PhoneReader implements Narrator {
  words = new Map<number, Box>()
  current: number | null = null
  private name = `r${++readers}`  // in each text's id, as the engine is the app's one
  private unlisten: (() => void) | null = null
  private snap: Snapshot
  private pageNow: () => number = () => 1
  private listeners = new Set<() => void>()
  private wordListeners = new Set<(id: number | null) => void>()
  private doc: PDFDocumentProxy | null = null
  private list: Word[] = []
  private starts: number[] = []  // where each sentence starts
  private sentenceOf: number[] = []
  private byPage = new Map<number, number[]>()
  private round = 0  // bumps when the PDF changes: words read from the old one are dropped
  private gen = 0  // bumps with every new run of speech: events from an older one are dropped
  private from = 0  // the word this run started at
  private ahead = -1  // the last sentence looked at for the queue
  private last = -1  // the last sentence queued
  private spoken = new Map<number, Spoken>()
  private at = -1  // the word to go on from; -1: the page in view
  private open = false
  private preparing: Promise<boolean> | null = null
  private guess = 0
  private ranged = false
  private watch = 0
  private chain: Promise<unknown> = Promise.resolve()  // engine calls in order: a queue must stay in order
  private hearing = new Map<string, () => void>()

  constructor() {
    const rate = Number(stored(RATE_KEY, '1'))
    this.snap = { phase: 'off', playing: false, text: '', page: 1, pages: 0, voice: stored(VOICE_KEY, ''),
      rate: SPEEDS.includes(rate) ? rate : 1 }
  }

  // -- for React -----------------------------------------------------------------------------------------------
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  getSnapshot = () => this.snap
  onWord(fn: (id: number | null) => void) {
    this.wordListeners.add(fn)
    return () => { this.wordListeners.delete(fn) }
  }
  private set(p: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...p }
    this.listeners.forEach((f) => f())
  }
  get ready() { return this.open && this.list.length > 0 }
  watchPage(fn: () => number) { this.pageNow = fn }

  // -- what the PDF is --------------------------------------------------------------------------------------------
  setDocument(doc: PDFDocumentProxy) {
    if (doc === this.doc) return
    this.reset()
    this.doc = doc
    this.set({ pages: doc.numPages })
  }

  /** The PDF changed (a new build): its words must be read again. */
  reset() {
    this.close()
    this.round++
    this.preparing = null
    this.list = []
    this.starts = []
    this.sentenceOf = []
    this.byPage = new Map()
    this.words = new Map()
    this.set({ phase: 'off' })
  }

  /** The player opened: the voice, and the page in view (kept up while nothing is read). */
  begin() {
    this.open = true
    this.listen()
    this.set({ page: this.pageNow(), pages: this.doc?.numPages ?? 0 })
    clearInterval(this.watch)
    this.watch = window.setInterval(() => {
      if (!this.snap.playing && this.at < 0 && this.pageNow() !== this.snap.page) this.set({ page: this.pageNow() })
    }, 700)
    this.pickVoice().catch((e: Error) => this.set({ phase: 'error', text: e.message }))
  }

  /** Stop listening to the engine (the screen went away). */
  dispose() {
    this.close()
    this.unlisten?.()
    this.unlisten = null
  }

  setVoice(v: string) {
    store(VOICE_KEY, v)
    this.set({ voice: v })
    if (this.snap.playing) this.run(this.at)
  }

  setRate(r: number) {
    store(RATE_KEY, String(r))
    this.set({ rate: r })
    if (this.snap.playing) this.run(this.at)
  }

  // -- the player --------------------------------------------------------------------------------------------------
  async play(spot?: Spot) {
    this.open = true
    this.listen()
    if (!(await this.prepare())) return
    let i = spot ? this.wordAt(spot.page, spot.x, spot.y) ?? this.firstOn(spot.page) : this.at
    if (i < 0) i = this.firstOn(this.pageNow())
    this.run(i)
  }

  pause() {
    this.quiet()
    this.set({ playing: false })
  }

  toggle() { if (this.snap.playing) this.pause(); else this.play() }

  /** Back: to the start of this sentence, or the one before when it has only just begun. Forward: the next one. */
  skip(direction: -1 | 1) {
    if (!this.list.length) return
    const i = this.at >= 0 ? this.at : this.firstOn(this.pageNow())
    const s = this.sentenceOf[i]
    const to = direction < 0 ? (i - this.starts[s] > 2 ? s : Math.max(0, s - 1)) : s + 1
    if (to >= this.starts.length) return
    const j = this.starts[to]
    if (this.snap.playing) this.run(j)
    else { this.at = j; this.show(j) }
  }

  /** Quiet, and back to the start: Play reads from the page in view. */
  stop() {
    this.pause()
    this.at = -1
    this.show(null)
    this.set({ page: this.pageNow() })
  }

  readFrom(spot: Spot) { this.play(spot) }

  /** Leave read aloud. The words stay, so opening it again is quick. */
  close() {
    this.pause()
    clearInterval(this.watch)
    this.open = false
    this.at = -1
    this.show(null)
    this.set({ phase: this.list.length ? 'ready' : 'off', text: '' })
  }

  wordAt(page: number, x: number, y: number): number | null {
    let best: number | null = null, dist = Infinity
    for (const id of this.byPage.get(page) ?? []) {
      const [, x0, y0, x1, y1] = this.words.get(id)!
      const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0, dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0
      const d = dx + dy * 3
      if (d < dist) { dist = d; best = id }
    }
    return dist < 30 ? best : null
  }

  /** The dictionary's "Hear it": its own recording when it has one, else the phone's voice. Reading pauses. */
  async hear(word: string) {
    if (this.snap.playing) this.pause()
    try {
      const got = await call<{ data: string; mime?: string }>('readaloud.say', { word, recording_only: true })
      if (got.data) return await playOnce(got.data, got.mime)
    } catch { /* not in the dictionary, or no internet: the phone says it */ }
    this.listen()
    const engine = await speech()
    const id = `${this.name}.word.${Date.now()}`
    const done = new Promise<void>((r) => { this.hearing.set(id, r); setTimeout(r, 8000) })
    await this.engineCall(() => engine.speak({ id, text: word, voice: this.snap.voice, rate: 1, flush: true }))
    await done
    this.hearing.delete(id)
  }

  // -- inside ------------------------------------------------------------------------------------------------------
  private listen() {
    if (this.unlisten) return
    let off: (() => void) | null = null, gone = false
    this.unlisten = () => { gone = true; off?.() }
    speech().then((e) => { if (!gone) off = e.listen((ev) => this.event(ev)) }).catch(() => {})
  }

  private async pickVoice() {
    const v = await phoneVoices()
    if (!this.snap.voice || !v.voices.some((x) => x.id === this.snap.voice)) this.set({ voice: v.default })
  }

  private engineCall(fn: () => Promise<unknown>) {
    const next = this.chain.then(fn)
    this.chain = next.catch(() => {})
    return next
  }

  /** The words of the PDF, read once. False when there are none (or the PDF changed meanwhile). */
  private prepare(): Promise<boolean> {
    if (this.list.length) return Promise.resolve(true)
    if (!this.doc) {
      this.set({ phase: 'error', text: 'The PDF is still opening. Try again in a moment.' })
      return Promise.resolve(false)
    }
    this.preparing ??= this.load(this.doc, this.round)
    return this.preparing
  }

  private async load(doc: PDFDocumentProxy, round: number) {
    const pages = doc.numPages
    this.set({ phase: 'preparing', text: 'Reading the PDF…' })
    try {
      const [list] = await Promise.all([
        pdfWords(doc, (p) => {
          if (round === this.round && pages > 4) this.set({ text: `Reading the PDF, page ${p} of ${pages}` })
        }, () => round !== this.round),
        this.pickVoice(),
      ])
      if (round !== this.round) return false
      if (!list.some((w) => w.say)) {
        this.preparing = null
        this.set({ phase: 'error', text: 'This PDF has no text to read' })
        return false
      }
      this.list = list
      this.starts = sentences(list)
      this.sentenceOf = new Array(list.length)
      this.starts.forEach((start, s) => {
        const end = this.starts[s + 1] ?? list.length
        for (let i = start; i < end; i++) this.sentenceOf[i] = s
      })
      this.words = new Map(list.map((w, i) => [i, [w.page, ...w.box] as Box]))
      this.byPage = new Map()
      list.forEach((w, i) => {
        if (!this.byPage.has(w.page)) this.byPage.set(w.page, [])
        this.byPage.get(w.page)!.push(i)
      })
      this.set({ phase: 'ready', text: '' })
      return true
    } catch (e) {
      this.preparing = null
      if (round === this.round) this.set({ phase: 'error', text: (e as Error).message })
      return false
    }
  }

  private firstOn(page: number) {
    const i = this.list.findIndex((w) => w.page >= page && w.say)
    return i < 0 ? 0 : i
  }

  /** Speak from word i on: what is queued is dropped. */
  private run(i: number) {
    this.quiet()
    const g = this.gen
    this.from = i
    this.at = i
    this.ahead = this.sentenceOf[i] - 1
    this.last = -1
    this.show(i)
    this.set({ phase: 'ready', playing: true, text: '' })
    this.fill(this.sentenceOf[i], g, true)
  }

  /** Queue sentences until AHEAD are waiting after the one being said. */
  private fill(saying: number, g: number, flush = false) {
    let queued = false
    while (this.ahead < saying + AHEAD && this.ahead + 1 < this.starts.length) {
      const s = ++this.ahead
      const u = this.text(s, s === this.sentenceOf[this.from] ? this.from : this.starts[s])
      if (!u) continue
      this.spoken.set(s, u)
      this.last = s
      queued = true
      const first = flush
      flush = false
      speech().then((engine) => this.engineCall(() => engine.speak({ id: `${this.name}.${g}.${s}`, text: u.text,
        voice: this.snap.voice, rate: this.snap.rate, flush: first }))).catch((e: Error) => {
        if (g === this.gen) { this.quiet(); this.set({ playing: false, text: e.message }) }
      })
    }
    if (flush && !queued) this.finished()  // nothing left to say
  }

  private text(s: number, from: number): Spoken | null {
    const end = this.starts[s + 1] ?? this.list.length
    const out: Spoken = { text: '', offsets: [], ids: [] }
    for (let i = from; i < end; i++) {
      const say = this.list[i].say
      if (!say) continue
      if (out.text) out.text += ' '
      out.offsets.push(out.text.length)
      out.ids.push(i)
      out.text += say
    }
    return out.text ? out : null
  }

  private event(e: SpeechEvent) {
    const [name, g, s] = e.id.split('.')
    if (name !== this.name) return
    if (g === 'word') {
      if (e.kind !== 'start' && e.kind !== 'range') this.hearing.get(e.id)?.()
      return
    }
    const u = this.spoken.get(Number(s))
    if (Number(g) !== this.gen || !u) return
    if (e.kind === 'start') {
      this.ranged = false
      this.mark(u.ids[0])
      this.follow(u)
      this.fill(Number(s), this.gen)
    } else if (e.kind === 'range') {
      this.ranged = true
      clearInterval(this.guess)
      let k = 0
      while (k + 1 < u.offsets.length && u.offsets[k + 1] <= (e.start ?? 0)) k++
      this.mark(u.ids[k])
    } else if (e.kind === 'done') {
      clearInterval(this.guess)
      this.spoken.delete(Number(s))
      if (Number(s) === this.last && this.ahead + 1 >= this.starts.length) this.finished()
    } else if (e.kind === 'error') {
      this.quiet()
      this.set({ playing: false, text: 'The voice stopped. Press play to go on, or pick another voice.' })
    }
  }

  private mark(id: number) {
    this.at = id
    this.show(id)
  }

  /** A voice that doesn't say which word it is on: move along at a speaking pace until it does. */
  private follow(u: Spoken) {
    clearInterval(this.guess)
    const began = Date.now(), g = this.gen
    this.guess = window.setInterval(() => {
      if (this.ranged || g !== this.gen) { clearInterval(this.guess); return }
      const char = (Date.now() - began) / 1000 * GUESS_RATE * this.snap.rate
      let k = 0
      while (k + 1 < u.offsets.length && u.offsets[k + 1] <= char) k++
      this.mark(u.ids[k])
    }, 200)
  }

  private finished() {
    this.quiet()
    this.at = -1
    this.show(null)
    this.set({ playing: false })
  }

  /** Stop speaking: the queue goes, and events still on their way are dropped. */
  private quiet() {
    this.gen++
    clearInterval(this.guess)
    this.spoken.clear()
    if (this.snap.playing) speech().then((e) => this.engineCall(() => e.stop())).catch(() => {})
  }

  private show(id: number | null) {
    if (id !== null) {
      const page = this.list[id]?.page
      if (page && page !== this.snap.page) this.set({ page })
    }
    if (id === this.current) return
    this.current = id
    this.wordListeners.forEach((f) => f(id))
  }
}

/** One phone reader for as long as the component lives. */
export function usePhoneReader(): PhoneReader {
  const [r] = useState(() => new PhoneReader())
  useEffect(() => () => r.dispose(), [r])
  return r
}

export function useReaderState(r: PhoneReader): Snapshot {
  return useSyncExternalStore(r.subscribe, r.getSnapshot)
}
