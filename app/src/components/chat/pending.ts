// Your message in the chat the moment you send it. It showed only once Claude wrote it to its file and the next read
// brought it, seconds later, so sending looked like nothing happened (2026-11-24 report: "when I send msg in claude
// chat, it doesn't look real"). Until Claude's file has it, a dimmed copy stands at the end of the chat.
import type { Item } from './model'

export const QUEUED_MS = 4_000  // not in Claude's file yet after this while Claude works: it waits its turn
export const PENDING_MS = 10 * 60_000  // long after: Claude never took it (it is in its box or the terminal by then)

/** before: how many messages of yours with this text Claude's file had when you sent it; one more is this one. */
export type Pending = { id: string; text: string; at: number; before: number }

const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Shown at once as yours: not a / command (it shows as a command) or a ! shell line (as its output). */
export const pends = (text: string) => !!flat(text) && !/^[/!]/.test(flat(text))

const yours = (items: Item[], text: string) => items.filter((i) => i.kind === 'user' && flat(i.text) === flat(text))

/** What is still on its way, and which messages in Claude's file took a dimmed copy's place (they come in without a
 * second rise). It goes when Claude's file has one more message of yours with its text than when you sent it, when
 * Claude gave it back unsent (given: what sits in Claude's box), or after PENDING_MS. */
export function settle(waiting: Pending[], items: Item[], given: string, now: number): { left: Pending[]; took: string[] } {
  const left: Pending[] = [], took: string[] = []
  for (const p of waiting) {
    const there = yours(items, p.text)
    if (there.length > p.before) took.push(there[p.before].id)
    else if (given.trim() && flat(given) === flat(p.text)) { /* back in Claude's box: the note above yours says so */ }
    else if (now - p.at <= PENDING_MS) left.push(p)
  }
  return { left, took }
}

/** A message just sent. Two the same, one after the other, wait for two in Claude's file. */
export function pend(text: string, items: Item[], waiting: Pending[], at: number, id: string): Pending {
  const same = settle(waiting, items, '', at).left.filter((p) => flat(p.text) === flat(text)).length
  return { id, text, at, before: yours(items, text).length + same }
}

/** What the dimmed copy says under it. Claude takes a message sent while it works only between two steps. */
export const pendingNote = (p: Pending, busy: boolean, now: number) =>
  busy && now - p.at >= QUEUED_MS ? 'Waiting for Claude…' : 'Sending…'
