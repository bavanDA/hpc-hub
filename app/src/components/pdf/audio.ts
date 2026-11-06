import { call } from '../../rpc'
import { fromBase64 } from './load'
import type { Timing } from './words'

/** url: the MP3 streamed from the backend on 127.0.0.1, to play at once */
export type Narration = { audio: string; duration: number; words: number[][]; timings: Timing[]; mime?: string; url?: string }

/** The whole MP3 through the RPC in pieces, as a blob: only when streaming it from url failed. */
export async function audioUrl(n: Narration): Promise<string> {
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
export function trace(text: string) {
  call('readaloud.trace', { text }).catch(() => {})
}

/** Whether the player got the recording's length; a stream that says nothing for 4 s counts as failed. */
export function metadata(a: HTMLAudioElement, wait = 4000): Promise<boolean> {
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

/** Stops a player and lets go of its stream. */
export function release(a: HTMLAudioElement) {
  a.pause()
  URL.revokeObjectURL(a.src)
  a.removeAttribute('src')
  a.load()
}
