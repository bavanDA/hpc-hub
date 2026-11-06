import type { ReactNode } from 'react'

export type Layout = 'split' | 'inline'
/** A change block that can go back: its lines now (n from `line`) become the old ones. */
export type PutBack = { path: string; line: number; expect: string[]; lines: string[] }
/** What to ask about or note: a change block or selected text. line..end are lines now (new side); anchor is the
 *  row a thread shows under ("path#n12" or "path#o12"). */
export type Target = { path: string; line: number; end: number; diff: string; text?: string; anchor: string }
/** Asks and notes on the rows: under(anchor) shows threads under a row, pins(path, n) the notes on a line. */
export type Asking = { onAsk: (t: Target) => void; onNote: (t: Target) => void; under: (anchor: string) => ReactNode
  pins: (path: string, n: number) => { n: number; done: boolean }[] }
