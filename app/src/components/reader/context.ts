import type { PDFDocumentProxy } from 'pdfjs-dist'
import { createContext, useContext } from 'react'

import type { Doc } from './model'

/** What every block of the paper needs: the paper, the PDF for cut math, the body text size, the search. */
export type ReaderContext = { doc: Doc; pdf: PDFDocumentProxy | null; body: number; query: string }

export const Ctx = createContext<ReaderContext | null>(null)
export const useCtx = () => useContext(Ctx)!
