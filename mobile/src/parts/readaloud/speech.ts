// The phone's own voice for Read aloud: Android's text to speech (SpeechPlugin.kt, through phone.rs). In a plain
// browser (the demo) the browser's speechSynthesis stands in, or a quiet voice that only keeps time when the
// browser has none, so the player still moves.
import { Channel, invoke } from '@tauri-apps/api/core'

/** A voice as the engine names it: lang is a tag like en-US; offline voices work without the internet. */
export type RawVoice = { name: string; lang: string; offline: boolean }
/** start, then range for each word (character offsets in the text), then done; stop when cut short. */
export type SpeechEvent = { kind: 'start' | 'range' | 'done' | 'stop' | 'error'; id: string; start?: number; end?: number }
export type Utterance = { id: string; text: string; voice: string; rate: number; flush: boolean }

export interface Speech {
  voices(): Promise<{ voices: RawVoice[]; default: string }>
  speak(u: Utterance): Promise<void>
  stop(): Promise<void>
  listen(fn: (e: SpeechEvent) => void): () => void
}

async function native<T>(command: string, args: Record<string, unknown> = {}): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : (e as Error).message ?? String(e))
  }
}

class AndroidSpeech implements Speech {
  private fns = new Set<(e: SpeechEvent) => void>()
  private listening: Promise<unknown> | null = null

  private ready() {
    if (!this.listening) {
      const channel = new Channel<SpeechEvent>()
      channel.onmessage = (e) => this.fns.forEach((f) => f(e))
      this.listening = native('speech_listen', { channel }).catch((e) => { this.listening = null; throw e })
    }
    return this.listening
  }
  async voices() {
    await this.ready()
    return native<{ voices: RawVoice[]; default: string }>('speech_voices')
  }
  async speak(u: Utterance) {
    await this.ready()
    await native('speech_speak', { ...u, voice: u.voice || null })
  }
  async stop() { await native('speech_stop') }
  listen(fn: (e: SpeechEvent) => void) { this.fns.add(fn); return () => { this.fns.delete(fn) } }
}

/** The browser's voices, for the demo. */
class BrowserSpeech implements Speech {
  private fns = new Set<(e: SpeechEvent) => void>()
  private live = new Set<SpeechSynthesisUtterance>()  // kept, or Chrome drops their events

  private emit(e: SpeechEvent) { this.fns.forEach((f) => f(e)) }
  async voices() {
    const list = speechSynthesis.getVoices()
    return { voices: list.map((v) => ({ name: v.voiceURI, lang: v.lang, offline: v.localService })),
      default: list.find((v) => v.default)?.voiceURI ?? '' }
  }
  async speak(u: Utterance) {
    if (u.flush) this.drop()
    const s = new SpeechSynthesisUtterance(u.text)
    const voice = speechSynthesis.getVoices().find((v) => v.voiceURI === u.voice)
    if (voice) { s.voice = voice; s.lang = voice.lang }
    s.rate = u.rate
    s.onstart = () => this.emit({ kind: 'start', id: u.id })
    s.onboundary = (e) => {
      if (e.name === 'word') this.emit({ kind: 'range', id: u.id, start: e.charIndex, end: e.charIndex + (e.charLength || 1) })
    }
    s.onend = () => { this.live.delete(s); this.emit({ kind: 'done', id: u.id }) }
    s.onerror = (e) => {
      this.live.delete(s)
      this.emit({ kind: e.error === 'canceled' || e.error === 'interrupted' ? 'stop' : 'error', id: u.id })
    }
    this.live.add(s)
    speechSynthesis.speak(s)
  }
  private drop() { this.live.clear(); speechSynthesis.cancel() }
  async stop() { this.drop() }
  listen(fn: (e: SpeechEvent) => void) { this.fns.add(fn); return () => { this.fns.delete(fn) } }
}

/** No sound, only time: each word a moment, as a voice would say it. */
class QuietSpeech implements Speech {
  private fns = new Set<(e: SpeechEvent) => void>()
  private queue: Utterance[] = []
  private timer = 0

  private emit(e: SpeechEvent) { this.fns.forEach((f) => f(e)) }
  async voices() {
    const v = (name: string, lang: string, offline: boolean) => ({ name, lang, offline })
    return { default: 'en-us-x-iol-local', voices: [
      v('en-us-x-iol-local', 'en-US', true), v('en-us-x-sfg-local', 'en-US', true), v('en-us-x-tpd-local', 'en-US', true),
      v('en-gb-x-gba-local', 'en-GB', true), v('en-au-x-aub-local', 'en-AU', true), v('en-in-x-ena-local', 'en-IN', true),
      v('de-de-x-deb-local', 'de-DE', true), v('fr-fr-x-frc-local', 'fr-FR', true), v('es-es-x-eec-local', 'es-ES', true),
      v('en-us-x-iol-network', 'en-US', false), v('en-us-x-sfg-network', 'en-US', false),
      v('en-gb-x-gba-network', 'en-GB', false), v('fa-ir-x-fad-network', 'fa-IR', false)] }
  }
  async speak(u: Utterance) {
    if (u.flush) this.drop()
    this.queue.push(u)
    if (this.queue.length === 1) this.next()
  }
  private next() {
    const u = this.queue[0]
    if (!u) return
    this.emit({ kind: 'start', id: u.id })
    const words = [...u.text.matchAll(/\S+/g)]
    let i = 0
    const step = () => {
      if (this.queue[0] !== u) return
      if (i >= words.length) {
        this.queue.shift()
        this.emit({ kind: 'done', id: u.id })
        this.next()
        return
      }
      const w = words[i++]
      this.emit({ kind: 'range', id: u.id, start: w.index!, end: w.index! + w[0].length })
      this.timer = window.setTimeout(step, (180 + w[0].length * 45) / u.rate)
    }
    step()
  }
  private drop() {
    clearTimeout(this.timer)
    const now = this.queue[0]
    this.queue = []
    if (now) this.emit({ kind: 'stop', id: now.id })
  }
  async stop() { this.drop() }
  listen(fn: (e: SpeechEvent) => void) { this.fns.add(fn); return () => { this.fns.delete(fn) } }
}

/** The browser's voices once it has listed them (Chrome lists them a moment after the page opens). */
async function browserHasVoices() {
  if (typeof speechSynthesis === 'undefined') return false
  if (speechSynthesis.getVoices().length) return true
  await new Promise((r) => {
    speechSynthesis.addEventListener('voiceschanged', r, { once: true })
    setTimeout(r, 800)
  })
  return speechSynthesis.getVoices().length > 0
}

let made: Promise<Speech> | null = null

/** The one voice engine for the app. ?speech=quiet in the demo keeps it silent. */
export function speech(): Promise<Speech> {
  made ??= (async () => {
    if ('__TAURI_INTERNALS__' in window) return new AndroidSpeech()
    const quiet = new URLSearchParams(location.search).get('speech') === 'quiet'
    return !quiet && await browserHasVoices() ? new BrowserSpeech() : new QuietSpeech()
  })()
  return made
}
