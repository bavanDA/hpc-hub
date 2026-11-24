// Which items in the chat come in with a short rise: only those that arrive while you watch (2026-11-24 report: no
// animation, "it is not look like a real chat"). What was there when the view opened, or came while you were on
// another tab or page, is history: it shows still, never the whole conversation rising at once.

/** old: ids shown still. at: the read the view had when it opened or came back; quiet until a newer read lands, so
 * what that first read brings (all of it, on a first open) is history too. */
export type Arrivals = { old: ReadonlySet<string>; shown: boolean; at: unknown; quiet: boolean }

const join = (old: ReadonlySet<string>, ids: string[]) => new Set([...old, ...ids])

/** The view drawn again. ids: its items now; read: what changes with every read of Claude's file (null while
 * nothing is read yet). Called on every draw, so the same call twice changes nothing. */
export function arrive(a: Arrivals | undefined, ids: string[], shown: boolean, read: unknown): Arrivals {
  if (!a) return { old: new Set(ids), shown, at: read, quiet: true }
  if (!shown) return a.shown ? { ...a, shown: false } : a
  if (!a.shown) return { old: join(a.old, ids), shown: true, at: read, quiet: true }  // back on this tab
  if (a.quiet && read !== null && read !== a.at) return { old: join(a.old, ids), shown: true, at: read, quiet: false }
  return a
}

/** Does this item come in with a rise? Decided when it first shows, and never again later. */
export const rises = (a: Arrivals, id: string) => !a.quiet && !a.old.has(id)
