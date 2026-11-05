// The PDF viewer, loaded with pdf.js only when a PDF first shows (keeps the main bundle small).
import { lazy, Suspense, type ReactNode } from 'react'

import { Spinner } from '../ui'
import type { Narrator, Spot } from './reader'

/** A word you right-clicked or held: its text, where it is on the page, and where on the screen. */
export type WordPick = { text: string; spot: Spot; x: number; y: number; touch: boolean }

/** Where to scroll, in PDF points from the page's top left; n changes for each new jump. */
export type PdfTarget = { page: number; x: number; y: number; n: number }

export type PdfProps = {
  data: Uint8Array | null  // new bytes reload the PDF, keeping zoom and scroll
  memory?: string  // remembers zoom and scroll under this name, also across visits
  compact?: boolean  // a small toolbar, for the Files preview
  zoom?: string  // to start with: page-width (default), page-fit, auto, or a number like 1.25
  loading?: boolean
  progress?: number  // 0..1 while the bytes arrive
  message?: ReactNode  // shown instead of the PDF (no PDF yet, an error)
  onSync?: (page: number, x: number, y: number) => void  // double-click on a page, in PDF points from top left
  target?: PdfTarget | null
  extra?: ReactNode  // more buttons at the right of the toolbar
  reader?: Narrator  // read aloud: the spoken word is drawn and followed; a click on a word reads from there
  onWord?: (w: WordPick) => void  // right-click (or hold, on a touch screen) on a word
  onLookUp?: (w: WordPick) => void  // double-click on a word, where a double-click isn't SyncTeX (no onSync)
  bar?: ReactNode  // under the toolbar
  footer?: ReactNode  // under the pages
  focus?: boolean  // Just the PDF: the toolbar hides (the parent hides its own bars too); left out, the viewer's own
  onFocus?: (on: boolean) => void
}

const Viewer = lazy(() => import('./PdfViewer'))

export function Pdf(props: PdfProps) {
  return (
    <Suspense fallback={<div className="grid h-full place-items-center bg-view"><Spinner size={24} /></div>}>
      <Viewer {...props} />
    </Suspense>
  )
}
