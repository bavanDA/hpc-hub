// Read aloud for the PDF viewer, shared by the desktop and the phone: asks the backend for the narration of a PDF
// on a cluster (readaloud.start, then `readaloud` events), plays it, and says which word is being spoken. The
// viewer draws that word; the player and the dictionary are the screens' own.
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useState, useSyncExternalStore } from 'react'

import { call, on } from '../../rpc'
import { fromBase64 } from './load'

export type Source = { cluster: string; path: string }
/** page (1-based), x0, y0, x1, y1 in PDF points from the page's top left */
export type Box = [number, number, number, number, number]
export type Spot = { page: number; x: number; y: number }
export type Voice = { id: string; label: string }
type Narration = { audio: string; duration: number; words: number[][]; timings: [number, number, number][]
  mime?: string; url?: string }  // url: the MP3 streamed from the backend on 127.0.0.1, to play at once
type Job = { id: string; state: 'starting' | 'part' | 'full' | 'error'; text: string; error: string
  offline: boolean; narration: Narration | null; offset: number; n: number }

export type Snapshot = {
  phase: 'off' | 'preparing' | 'ready' | 'error'
  playing: boolean
  text: string  // what is being done, or what went wrong
  offline: boolean
  at: number
  total: number
  voice: string
  rate: number
}

/** What the viewer needs from a reader: this narration, or the phone's own voice (which reads the PDF's words
 *  itself, from the document the viewer hands it). */
export interface Narrator {
  words: Map<number, Box>
  current: number | null
  readonly ready: boolean
  onWord(fn: (id: number | null) => void): () => void
  watchPage(fn: () => number): void
  readFrom(spot: Spot): void
  wordAt(page: number, x: number, y: number): number | null
  reset(): void
  setDocument?(doc: PDFDocumentProxy): void
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]
export const speedLabel = (r: number) => `${r}×`

export function stored(key: string, fallback: string) {
  try { return localStorage.getItem(key) ?? fallback } catch { return fallback }
}
export function store(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private window */ }
}

/** The whole MP3 through the RPC in pieces, as a blob: only when streaming it from url failed. */
async function audioUrl(n: Narration): Promise<string> {
  const parts: Uint8Array<ArrayBuffer>[] = []
  let offset = 0, total = Infinity
  while (offset < total) {
    const c = await call<{ data: string; total: number }>('readaloud.audio', { token: n.audio, offset })
    total = c.total
    const bytes = fromBase64(c.data) as Uint8Array<ArrayBuffer>
    if (!bytes.length) break
    parts.push(bytes)
    offset += bytes.length
  }
  return URL.createObjectURL(new Blob(parts, { type: n.mime ?? 'audio/mpeg' }))
}

/** One sound, start to end (a word's pronunciation). */
export async function playOnce(base64: string, mime = 'audio/mpeg') {
  const url = URL.createObjectURL(new Blob([fromBase64(base64) as Uint8Array<ArrayBuffer>], { type: mime }))
  const a = new Audio(url)
  a.addEventListener('ended', () => URL.revokeObjectURL(url))
  await a.play()
}

let voiceList: Promise<{ voices: Voice[]; default: string }> | null = null
export const voices = () => (voiceList ??= call<{ voices: Voice[]; default: string }>('readaloud.voices')
  .catch((e) => { voiceList = null; throw e }))

export function useVoices(): Voice[] {
  const [list, setList] = useState<Voice[]>([])
  useEffect(() => { voices().then((v) => setList(v.voices)).catch(() => {}) }, [])
  return list
}

export class Reader implements Narrator {
  source: Source | null = null
  words = new Map<number, Box>()
  current: number | null = null
  private snap: Snapshot
  private pageNow: () => number = () => 1  // the page in view: reading starts there
  private listeners = new Set<() => void>()
  private wordListeners = new Set<(id: number | null) => void>()
  private byPage = new Map<number, number[]>()
  private times: [number, number, number][] = []
  private audio: HTMLAudioElement | null = null
  private job = ''
  private n = -1
  private round = 0  // bumps when the PDF or the voice changes: answers for the old one are dropped
  private pending: Spot | null = null  // read from here once the narration arrives
  private timer = 0
  private token = ''  // the recording playing now
  private queue = Promise.resolve()
  private stopEvents: (() => void) | null = null
  private playing: Narration | null = null  // the narration the audio is from

  constructor() {
    const rate = Number(stored('readaloud.rate', '1'))
    this.snap = { phase: 'off', playing: false, text: '', offline: false, at: 0, total: 0,
      voice: stored('readaloud.voice', ''), rate: SPEEDS.includes(rate) ? rate : 1 }
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
  get ready() { return !!this.audio }
  /** The viewer says how to find the page you are looking at. */
  watchPage(fn: () => number) { this.pageNow = fn }

  // -- what the PDF is --------------------------------------------------------------------------------------------
  setSource(s: Source | null) {
    if (s?.cluster === this.source?.cluster && s?.path === this.source?.path) return
    this.source = s
    this.reset()
  }

  /** The PDF changed (a new build) or the voice did: the narration no longer fits. */
  reset() {
    this.round++
    if (this.job) call('readaloud.stop', { id: this.job }).catch(() => {})
    this.job = ''
    this.n = -1
    this.pending = null
    this.token = ''
    this.stopEvents?.()
    this.stopEvents = null
    this.drop()
    this.set({ phase: 'off', playing: false, text: '', offline: false, at: 0, total: 0 })
  }

  setVoice(v: string) {
    store('readaloud.voice', v)
    this.set({ voice: v })
    this.reset()
  }

  setRate(r: number) {
    store('readaloud.rate', String(r))
    if (this.audio) this.audio.playbackRate = r
    this.set({ rate: r })
  }

  // -- the player --------------------------------------------------------------------------------------------------
  async play(from?: Spot) {
    if (this.audio) {
      if (from) this.seekSpot(from)
      else if (this.audio.currentTime === 0) this.audio.currentTime = this.firstOn(this.pageNow())
      this.audio.play().catch((e: Error) => this.set({ text: `Could not play: ${e.message}` }))
      return
    }
    if (this.snap.phase === 'preparing' || !this.source) return
    this.pending = from ?? null
    await this.prepare(from?.page ?? this.pageNow())
  }

  pause() { this.audio?.pause() }
  toggle() { if (this.snap.playing) this.pause(); else this.play() }

  skip(seconds: number) {
    const a = this.audio
    if (!a) return
    a.currentTime = Math.max(0, Math.min(a.currentTime + seconds, (a.duration || 1e9) - 0.1))
    this.tick(true)
  }

  /** Back to the start, quiet. The narration stays, so Play is instant. */
  stop() {
    const a = this.audio
    if (!a) return
    a.pause()
    a.currentTime = 0
    this.show(null)
    this.set({ at: 0 })
  }

  /** Read from a spot on a page (a clicked word), starting the narration if it isn't there yet. */
  readFrom(spot: Spot) { this.play(spot) }

  /** Leave read aloud: quiet, and the narration let go. */
  close() { this.reset() }

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

  // -- inside ------------------------------------------------------------------------------------------------------
  private seekSpot(s: Spot) {
    const id = this.wordAt(s.page, s.x, s.y)
    const t = id === null ? undefined : this.times.find((w) => w[0] === id)
    if (this.audio) this.audio.currentTime = t ? t[1] : this.firstOn(s.page)
    this.tick(true)
  }

  private firstOn(page: number) {
    for (const [id, start] of this.times) if ((this.words.get(id)?.[0] ?? 0) >= page) return start
    return 0
  }

  private async prepare(page: number) {
    const round = this.round, source = this.source!
    this.set({ phase: 'preparing', text: 'Getting the voice ready…', offline: false })
    this.stopEvents?.()
    this.stopEvents = on('readaloud', (d) => this.event(d as Job, round))
    try {
      if (!this.snap.voice) this.set({ voice: (await voices()).default })
      const job = await call<Job>('readaloud.start', { ...source, voice: this.snap.voice, page })
      if (round !== this.round) { call('readaloud.stop', { id: job.id }).catch(() => {}); return }
      this.job = job.id
      const now = await call<Job | null>('readaloud.follow', { id: job.id })
      if (now) this.event(now, round)
    } catch (e) {
      if (round === this.round) this.set({ phase: 'error', text: (e as Error).message })
    }
  }

  private event(j: Job, round: number) {  // one at a time, in order: a part may still be loading when the whole comes
    this.queue = this.queue.then(() => this.handle(j, round)).catch((e: Error) => {
      if (round === this.round) this.set(this.audio ? { text: e.message } : { phase: 'error', text: e.message })
    })
  }

  private async handle(j: Job, round: number) {
    if (round !== this.round || j.id !== this.job || j.n <= this.n) return
    this.n = j.n
    if (j.error) {
      this.set(this.audio ? { text: j.error } : { phase: 'error', text: j.error, offline: j.offline })
      return
    }
    const n = j.narration
    if (!n || n.audio === this.token) {  // progress
      if (!this.audio && j.text) this.set({ text: j.text })
      return
    }
    this.token = n.audio
    const url = n.url || await audioUrl(n)
    if (round !== this.round) { URL.revokeObjectURL(url); return }
    if (j.state === 'full' && this.audio) await this.swap(url, n, j.offset)
    else await this.load(url, n)
  }

  private player(url: string) {
    const a = new Audio(url)
    a.preload = 'auto'
    a.playbackRate = this.snap.rate
    a.addEventListener('play', () => { if (a === this.audio) { this.set({ playing: true }); this.tick(true) } })
    a.addEventListener('pause', () => { if (a === this.audio) this.set({ playing: false }) })
    a.addEventListener('ended', () => { if (a === this.audio) this.set({ playing: false }) })
    a.addEventListener('seeked', () => { if (a === this.audio) this.tick(true) })
    a.addEventListener('loadedmetadata', () => {
      if (a === this.audio && Number.isFinite(a.duration) && a.duration > 0) this.set({ total: a.duration })
    })
    a.addEventListener('error', () => {
      if (a !== this.audio) return
      if (this.playing?.url && a.src === this.playing.url) void this.fallBack(a, this.playing)
      else this.set({ playing: false, text: 'The recording could not be played' })
    })
    return a
  }

  /** Streaming failed: fetch the whole recording through the RPC and go on from the same moment. */
  private async fallBack(a: HTMLAudioElement, n: Narration) {
    const round = this.round, at = a.currentTime, wasPlaying = !a.paused || this.snap.playing
    n.url = undefined
    this.set({ text: 'Loading the recording…' })
    try {
      const url = await audioUrl(n)
      if (round !== this.round || a !== this.audio) { URL.revokeObjectURL(url); return }
      await this.load(url, n, at, wasPlaying || at === 0)
      this.set({ text: '' })
    } catch (e) {
      if (round === this.round) this.set({ playing: false, text: (e as Error).message })
    }
  }

  private use(n: Narration) {
    this.words = new Map(n.words.map((w) => [w[0], w.slice(1, 6) as Box]))
    this.byPage = new Map()
    for (const [id, page] of n.words) {
      if (!this.byPage.has(page)) this.byPage.set(page, [])
      this.byPage.get(page)!.push(id)
    }
    this.times = n.timings
  }

  private async load(url: string, n: Narration, at = 0, play = true) {
    this.drop()
    this.use(n)
    const a = this.player(url)
    this.audio = a
    this.playing = n
    this.set({ phase: 'ready', text: '', total: n.duration, at })
    this.timer = window.setInterval(() => { if (!a.paused) this.tick() }, 100)
    const spot = this.pending
    this.pending = null
    if (!await metadata(a) || a !== this.audio) return  // a failed stream falls back (player's error)
    if (spot) this.seekSpot(spot)
    else if (at) a.currentTime = at
    if (play) a.play().catch((e: Error) => this.set({ text: `Could not play: ${e.message}` }))
  }

  /** The whole narration takes over from the first part at the same moment (offset: where the part began). */
  private async swap(url: string, n: Narration, offset: number): Promise<void> {
    const old = this.audio!
    const a = this.player(url)
    if (!await metadata(a) && n.url) {  // the stream failed: the whole one in pieces instead
      n.url = undefined
      return this.swap(await audioUrl(n), n, offset)
    }
    if (old !== this.audio) { URL.revokeObjectURL(url); return }
    const playing = !old.paused
    a.currentTime = offset + old.currentTime
    this.use(n)
    this.audio = a  // from here events come from the new one
    this.playing = n
    clearInterval(this.timer)
    this.timer = window.setInterval(() => { if (!a.paused) this.tick() }, 100)
    this.set({ total: n.duration })
    if (playing) await a.play().catch(() => {})
    old.pause()
    URL.revokeObjectURL(old.src)
    old.removeAttribute('src')
    old.load()  // lets go of a stream
    this.tick(true)
  }

  private drop() {
    clearInterval(this.timer)
    const old = this.audio
    this.audio = null  // first, so its last events are ignored
    this.playing = null
    if (old) { old.pause(); URL.revokeObjectURL(old.src); old.removeAttribute('src'); old.load() }
    this.words = new Map()
    this.byPage = new Map()
    this.times = []
    this.show(null)
  }

  private tick(force = false) {
    const a = this.audio
    if (!a) return
    const t = a.currentTime
    if (force || Math.floor(t) !== Math.floor(this.snap.at)) this.set({ at: t })
    let lo = 0, hi = this.times.length - 1, found = -1
    while (lo <= hi) {  // the last word that started by now
      const mid = (lo + hi) >> 1
      if (this.times[mid][1] <= t) { found = mid; lo = mid + 1 } else hi = mid - 1
    }
    this.show(found >= 0 ? this.times[found][0] : null)
  }

  private show(id: number | null) {
    if (id === this.current) return
    this.current = id
    this.wordListeners.forEach((f) => f(id))
  }
}

/** Loads a recording's start: true once it can play, false when it failed. */
function metadata(a: HTMLAudioElement): Promise<boolean> {
  return new Promise((done) => {
    a.addEventListener('loadedmetadata', () => done(true), { once: true })
    a.addEventListener('error', () => done(false), { once: true })
    a.load()
  })
}

/** One reader for as long as the component lives, following the PDF it reads. */
export function useReader(source: Source | null | undefined): Reader {
  const [r] = useState(() => new Reader())
  useEffect(() => { r.setSource(source ?? null) }, [r, source?.cluster, source?.path])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => r.close(), [r])
  return r
}

export function useReaderState(r: Reader): Snapshot {
  return useSyncExternalStore(r.subscribe, r.getSnapshot)
}

export function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

// -- the dictionary ------------------------------------------------------------------------------------------------
export type Sense = { definition: string; example: string; synonyms: string[] }
export type Entry = { word: string; phonetic?: string; respelling?: string; source?: string
  meanings?: { pos: string; senses: Sense[] }[]; error: string; offline: boolean }

export const lookUp = (word: string) => call<Entry>('readaloud.lookup', { word })

/** Say the word: the dictionary's recording, or the reader voice. */
export async function hear(word: string, voice: string) {
  const got = await call<{ data: string; mime?: string }>('readaloud.say', { word, voice })
  await playOnce(got.data, got.mime)
}
