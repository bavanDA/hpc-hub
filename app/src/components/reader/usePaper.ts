import type { PDFDocumentProxy } from 'pdfjs-dist'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import { engine, open } from '../pdf/engine'
import { loadLatex } from './latex/load'
import type { Doc } from './model'
import { fromPdf, pageWords, place, readText } from './pdftext'

export type Paper = { doc: Doc; pdf: PDFDocumentProxy | null; pages: number; body: number; note: string }

/** The paper to read: from its LaTeX source when asked and it can be read, else from the PDF's text. */
export function usePaper(data: Uint8Array | null, latex: { cluster: string; main: string } | undefined,
  fromSource: boolean) {
  const [paper, setPaper] = useState<Paper | null>(null)
  const [failed, setFailed] = useState('')
  useEffect(() => {
    let dead = false
    setFailed('')
    ;(async () => {
      const { lib } = await engine()
      const pdf = data ? await open(lib, data).promise : null
      const text = pdf ? await readText(pdf, () => dead) : null
      if (dead) return
      let doc: Doc | null = null, note = ''
      if (latex && fromSource) {
        try {
          const read = (path: string) => call<{ text: string }>('latex.read', { cluster: latex.cluster, path })
            .then((r) => r.text)
          doc = await loadLatex(read, latex.main)
          if (!doc.blocks.some((b) => b.t === 'p')) throw new Error('No text')
          if (text) place(doc.blocks, pageWords(text))
        } catch {
          doc = null
          if (text) note = 'The LaTeX source could not be read, so this is the text of the PDF.'
        }
      }
      if (!doc && text) doc = fromPdf(text)
      if (dead) return
      if (!doc || !doc.blocks.length) { setFailed(data ? 'This PDF has no text to show.' : 'No PDF yet.'); return }
      setPaper({ doc, pdf, pages: text?.count ?? 0, body: text?.body ?? 10, note })
    })().catch((e: Error) => { if (!dead) setFailed(`Could not read the text: ${e.message}`) })
    return () => { dead = true }
  }, [data, latex?.cluster, latex?.main, fromSource])  // eslint-disable-line react-hooks/exhaustive-deps
  return { paper, failed }
}
