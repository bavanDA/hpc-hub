// What went wrong lately, for a bug report: each failed backend call with the ref of its traceback in the backend
// (hpc_hub/api/recent.py), and each error the page didn't catch. In memory only; nothing leaves before Send.

export type Failure = { at: number; method: string; message: string; ref?: number }

const KEPT = 30
const MATCH_MS = 30_000  // a toast this soon after a failed call shows that call's error

const failures: Failure[] = []
const caught: string[] = []

const clock = (at: number) => new Date(at).toLocaleTimeString('en-GB', { hour12: false })
const lastLine = (s: string) => s.trim().split('\n').pop()?.trim() ?? ''

export function noteFailure(method: string, message: string, ref?: number) {
  failures.push({ at: Date.now(), method, message, ref })
  if (failures.length > KEPT) failures.shift()
}

/** An error the page caught (window error, a promise nobody waited for, a page that crashed). */
export function noteCaught(text: string) {
  caught.push(`${clock(Date.now())}  ${text}`)
  if (caught.length > KEPT) caught.shift()
}

/** The app's own log lines for a report: the errors it caught, oldest first. */
export const caughtLines = () => [...caught]

/** The failed call a message on screen comes from: shown text holds the call's message (or its last line). */
export function failureFor(text: string, now = Date.now()): Failure | undefined {
  for (let i = failures.length - 1; i >= 0; i--) {
    const f = failures[i]
    if (now - f.at > MATCH_MS) break
    const line = lastLine(f.message)
    if (line.length >= 4 && (text.includes(line) || line.includes(text.trim()))) return f
  }
  return undefined
}

/** Tests only. */
export function forgetAll() {
  failures.length = 0
  caught.length = 0
}
