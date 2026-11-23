// What the Chat view knows about one tab, and how each read adds to it.
import type { ChatEvent, ReadAnswer, Screen } from './model'

export type State = { events: ChatEvent[]; file: string; offset: number; trimmed: boolean; waiting: boolean
  unknown: boolean; cwd: string; screen: Screen | null; error: string; since: number
  links: Record<string, string>  // each line of this file -> the line before it
  leaf: string }  // the newest line: the conversation as it stands ends here

export const empty = (): State => ({ events: [], file: '', offset: -1, trimmed: false, waiting: true, unknown: false,
  cwd: '', screen: null, error: '', since: 0, links: {}, leaf: '' })

/** The events on the conversation as it stands. Claude's file only grows: going back to an earlier message (Esc
 * Esc, or Stop before Claude answered) starts a new branch from there, and what the branch went back on stays in
 * the file. Walking back from the newest line finds the lines still in the conversation; an event from a line this
 * file links elsewhere is left out (2026-11-22 report: a cancelled and edited message showed twice, run together).
 * Events from a line it never linked (an earlier file, or before a long chat's first read) all stay. */
export function onBranch(s: Pick<State, 'events' | 'links' | 'leaf'>): ChatEvent[] {
  if (!s.leaf) return s.events
  const kept = new Set<string>()
  for (let at = s.leaf; at && !kept.has(at); at = s.links[at] ?? '') kept.add(at)
  return s.events.filter((e) => !e.line || !(e.line in s.links) || kept.has(e.line))
}

/** Merge one read into the state: new events after the old, a new file after a note. */
export function merge(s: State, r: ReadAnswer): State {
  if (r.waiting) return { ...s, waiting: !s.file, unknown: !!r.unknown, error: '' }
  const switched = !!s.file && !!r.file && r.file !== s.file
  // a new file (after /clear): the old one's conversation as it stood is kept, then links start over
  const events = r.reset ? [] : switched ? onBranch(s) : s.events
  const links = r.reset || switched ? {} : { ...s.links }  // a new file links only its own lines
  for (const [line, before] of r.links ?? []) links[line] = before
  const leaf = r.links?.length ? r.links[r.links.length - 1][0] : r.reset || switched ? '' : s.leaf
  const note: ChatEvent[] = switched ? [{ kind: 'note', id: `new-${r.file}`, text: 'A new conversation started' }] : []
  const seen = new Set(events.map((e) => e.id))
  const fresh = (r.events ?? []).filter((e) => !seen.has(e.id))
  return { ...s, waiting: false, unknown: false, error: '', file: r.file ?? s.file, offset: r.offset ?? s.offset,
    trimmed: s.file ? s.trimmed : !!r.trimmed, cwd: r.cwd || s.cwd, events: [...events, ...note, ...fresh], links, leaf }
}
