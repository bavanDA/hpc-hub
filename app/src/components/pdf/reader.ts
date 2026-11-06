import type { PDFDocumentProxy } from 'pdfjs-dist'

import { call, on } from '../../rpc'
import { fromBase64 } from './load'
import { store, stored } from './storage'
import { voices } from './voices'
import { firstStartOn, indexWords, nearestWord, wordAtTime, type Timing } from './words'

export type Source = { cluster: string; path: string }
/** page (1-based), x0, y0, x1, y1 in PDF points from the page's top left */
export type Box = [number, number, number, number, number]
export type Spot = { page: number; x: number; y: number }
/** url: the MP3 streamed from the backend on 127.0.0.1, to play at once */
type Narration = { audio: string; duration: number; words: number[][]; timings: Timing[]; mime?: string; url?: string }
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

/** What the viewer needs from a reader: this narration, or the phone's own voice. */
export interface Narrator {
  words: Map<number, Box>
  current: number | null
  readonly ready: boolean
  onWord(fn: (id: number | null) => void): () => void
  watchPage(fn: () => number): (() => void) | void  // the returned function hands it back
  readFrom(spot: Spot): void
  wordAt(page: number, x: number, y: number): number | null
  reset(): void
  setDocument?(doc: PDFDocumentProxy): void
}

export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2]
export const speedLabel = (r: number) => `${r}×`

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

/** A line in ~/.cache/hpc-hub/readaloud.log, to see where Read aloud spends its time. */
function trace(text: string) {
  call('readaloud.trace', { text }).catch(() => {})
}

/** Whether the player got the recording's length; a stream that says nothing for 4 s counts as failed. */
function metadata(a: HTMLAudioElement, wait = 4000): Promise<boolean> {
  const t0 = performance.now()
  return new Promise((done) => {
    const end = (ok: boolean, why: string) => {
      clearTimeout(timer)
      trace(`player ${why} after ${Math.round(performance.now() - t0)} ms (${a.src.slice(0, 22)})`)
      done(ok)
    }
    const timer = window.setTimeout(() => end(false, 'silent'), wait)
    a.addEventListener('loadedmetadata', () => end(true, 'ready'), { once: true })
    a.addEventListener('error', () => end(false, `error ${a.error?.code ?? ''}`), { once: true })
    a.load()
  })
}

/** Read aloud of a PDF on a cluster: readaloud.start, then `readaloud` events with the narration to play. */
export class Reader implements Narrator {
  source: Source | null = null
  words = new Map<number, Box>()
  current: number | null = null
  private snap: Snapshot
  private pageNow: () => number = () => 1
  private listeners = new Set<() => void>()
  private wordListeners = new Set<(id: number | null) => void>()
  private byPage = new Map<number, number[]>()
  private times: Timing[] = []
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
  private falling: HTMLAudioElement | null = null  // the player whose stream failed, while the whole one loads

  constructor() {
    const rate = Number(stored('readaloud.rate', '1'))
    this.snap = { phase: 'off', playing: false, text: '', offline: false, at: 0, total: 0,
      voice: stored('readaloud.voice', ''), rate: SPEEDS.includes(rate) ? rate : 1 }
  }

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
  watchPage(fn: () => number) {
    const before = this.pageNow
    this.pageNow = fn
    return () => { if (this.pageNow === fn) this.pageNow = before }
  }

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

  async play(from?: Spot) {
    if (this.audio) {
      if (from) this.seekSpot(from)
      else if (this.audio.currentTime === 0) this.audio.currentTime = firstStartOn(this.times, this.words, this.pageNow())
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

  readFrom(spot: Spot) { this.play(spot) }

  close() { this.reset() }

  wordAt(page: number, x: number, y: number): number | null {
    return nearestWord(this.byPage.get(page) ?? [], this.words, x, y)
  }

  private seekSpot(s: Spot) {
    const id = this.wordAt(s.page, s.x, s.y)
    const t = id === null ? undefined : this.times.find((w) => w[0] === id)
    if (this.audio) this.audio.currentTime = t ? t[1] : firstStartOn(this.times, this.words, s.page)
    this.tick(true)
  }

  private async prepare(page: number) {
    const round = this.round, source = this.source!
    this.set({ phase: 'preparing', text: 'Getting the voice ready…', offline: false })
    this.stopEvents?.()
    this.stopEvents = on('readaloud', (d) => this.event(d as Job, round))
    try {
      if (!this.snap.voice) this.set({ voice: (await voices()).default })
      trace(`start page ${page}`)
      const job = await call<Job>('readaloud.start', { ...source, voice: this.snap.voice, page })
      if (round !== this.round) { call('readaloud.stop', { id: job.id }).catch(() => {}); return }
      this.job = job.id
      const now = await call<Job | null>('readaloud.follow', { id: job.id })
      if (now) this.event(now, round)
    } catch (e) {
      if (round === this.round) this.set({ phase: 'error', text: (e as Error).message })
    }
  }

  /** One at a time, in order: a part may still be loading when the whole comes. */
  private event(j: Job, round: number) {
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
    if (!n || n.audio === this.token) {
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
      if (a !== this.audio || a === this.falling) return
      if (this.playing?.url && a.src === this.playing.url) void this.fallBack(a, this.playing)
      else this.set({ playing: false, text: 'The recording could not be played' })
    })
    return a
  }

  /** Streaming failed: fetch the whole recording through the RPC and go on from the same moment. */
  private async fallBack(a: HTMLAudioElement, n: Narration) {
    if (this.falling === a) return
    this.falling = a
    const round = this.round, at = a.currentTime, wasPlaying = !a.paused || this.snap.playing
    n.url = undefined
    this.set({ text: 'Loading the recording…' })
    try {
      const t0 = performance.now()
      const url = await audioUrl(n)
      trace(`whole recording through the RPC in ${Math.round(performance.now() - t0)} ms`)
      if (round !== this.round || a !== this.audio) { URL.revokeObjectURL(url); return }
      await this.load(url, n, at, wasPlaying || at === 0)
      this.set({ text: '' })
    } catch (e) {
      if (round === this.round) this.set({ playing: false, text: (e as Error).message })
    }
  }

  private use(n: Narration) {
    const { words, byPage } = indexWords(n.words)
    this.words = words
    this.byPage = byPage
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
    if (!await metadata(a)) {
      if (a === this.audio && n.url) void this.fallBack(a, n)
      return
    }
    if (a !== this.audio) return
    if (spot) this.seekSpot(spot)
    else if (at) a.currentTime = at
    if (play) a.play().catch((e: Error) => this.set({ text: `Could not play: ${e.message}` }))
  }

  /** The whole narration takes over from the first part at the same moment (offset: where the part began). */
  private async swap(url: string, n: Narration, offset: number): Promise<void> {
    const old = this.audio!
    const a = this.player(url)
    if (!await metadata(a) && n.url) {
      n.url = undefined
      return this.swap(await audioUrl(n), n, offset)
    }
    if (old !== this.audio) { URL.revokeObjectURL(url); return }
    const playing = !old.paused
    a.currentTime = offset + old.currentTime
    this.use(n)
    this.audio = a
    this.playing = n
    clearInterval(this.timer)
    this.timer = window.setInterval(() => { if (!a.paused) this.tick() }, 100)
    this.set({ total: n.duration })
    if (playing) await a.play().catch(() => {})
    release(old)
    this.tick(true)
  }

  private drop() {
    clearInterval(this.timer)
    const old = this.audio
    this.audio = null  // first, so its last events are ignored
    this.playing = null
    if (old) release(old)
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
    this.show(wordAtTime(this.times, t))
  }

  private show(id: number | null) {
    if (id === this.current) return
    this.current = id
    this.wordListeners.forEach((f) => f(id))
  }
}

/** Stops a player and lets go of its stream. */
function release(a: HTMLAudioElement) {
  a.pause()
  URL.revokeObjectURL(a.src)
  a.removeAttribute('src')
  a.load()
}
