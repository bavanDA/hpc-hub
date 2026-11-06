import type { PDFDocumentProxy } from 'pdfjs-dist'

export type Source = { cluster: string; path: string }
/** page (1-based), x0, y0, x1, y1 in PDF points from the page's top left */
export type Box = [number, number, number, number, number]
export type Spot = { page: number; x: number; y: number }

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
