// What the Chat view knows about one tab, and how each read adds to it.
import type { ChatEvent, ReadAnswer, Screen } from './model'

export type State = { events: ChatEvent[]; file: string; offset: number; trimmed: boolean; waiting: boolean
  unknown: boolean; cwd: string; screen: Screen | null; error: string; since: number }

export const empty = (): State => ({ events: [], file: '', offset: -1, trimmed: false, waiting: true, unknown: false,
  cwd: '', screen: null, error: '', since: 0 })

/** Merge one read into the state: new events after the old, a new file after a note. */
export function merge(s: State, r: ReadAnswer): State {
  if (r.waiting) return { ...s, waiting: !s.file, unknown: !!r.unknown, error: '' }
  const switched = !!s.file && !!r.file && r.file !== s.file
  const events = r.reset ? [] : s.events
  const note: ChatEvent[] = switched ? [{ kind: 'note', id: `new-${r.file}`, text: 'A new conversation started' }] : []
  const seen = new Set(events.map((e) => e.id))
  const fresh = (r.events ?? []).filter((e) => !seen.has(e.id))
  return { ...s, waiting: false, unknown: false, error: '', file: r.file ?? s.file, offset: r.offset ?? s.offset,
    trimmed: s.file ? s.trimmed : !!r.trimmed, cwd: r.cwd || s.cwd, events: [...events, ...note, ...fresh] }
}
