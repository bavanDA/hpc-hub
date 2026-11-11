// Errors nothing else caught: a script error, or a promise that failed with no one waiting for it. Each is kept for a
// bug report (recent.ts) and handed to ReportHost, which shows one quiet toast with Report, never a pile of them.
import { noteCaught } from './recent'

export type Caught = { message: string; stack: string }

const IGNORED = [
  'ResizeObserver loop',  // the browser saying a resize took two frames: harmless
  'has no demo answer',  // the browser demo lacks an answer: design work, not a bug
]
const QUIET_MS = 60_000  // the same message is shown once a minute at most

const listeners = new Set<(c: Caught) => void>()
const shown = new Map<string, number>()
let installed = false

export function onCaught(fn: (c: Caught) => void): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

function describe(reason: unknown): Caught {
  if (reason instanceof Error) return { message: reason.message || reason.name, stack: reason.stack ?? '' }
  if (typeof reason === 'string') return { message: reason, stack: '' }
  let message = String(reason)
  try { message = JSON.stringify(reason) ?? message } catch { /* a cycle: String() it is */ }
  return { message, stack: '' }
}

/** Keep it, and tell ReportHost unless it was just shown. Also for a page the error boundary caught. */
export function caught(c: Caught, show = true) {
  if (!c.message || c.message === 'Script error.' || IGNORED.some((x) => c.message.includes(x))) return
  noteCaught(c.message)
  const last = shown.get(c.message) ?? 0
  if (!show || Date.now() - last < QUIET_MS) return
  shown.set(c.message, Date.now())
  listeners.forEach((fn) => fn(c))
}

/** Once, at start (main.tsx in each app). */
export function installCatchers() {
  if (installed) return
  installed = true
  window.addEventListener('error', (e) => caught(e.error ? describe(e.error) : { message: e.message, stack: '' }))
  window.addEventListener('unhandledrejection', (e) => caught(describe(e.reason)))
}
