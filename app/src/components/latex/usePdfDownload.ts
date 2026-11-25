import { useCallback, useRef } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { Transfer } from '../../types/files'
import { openFolder } from '../files/local'
import { useToast } from '../useToast'
import { downloadState, fileOf, pdfName, savedMessage } from './pdfDownload'
import type { PdfState } from './useBuiltPdf'

/** Download the built PDF with files.download (scp, a free name, in the Files transfer list); a toast says
 *  where it went, with Show in folder. */
export function usePdfDownload(cluster: string, folder: string, main: string, pdf: PdfState, running: boolean) {
  const toast = useToast()
  const ours = useRef(new Map<string, string>())  // transfer id: where it lands
  const early = useRef(new Map<string, Transfer>())  // ended before files.download answered with its id
  const asking = useRef(0)
  const state = downloadState(pdf, running)

  const report = useCallback((t: Transfer, path: string) => {
    if (t.error) {
      toast(t.error === 'Cancelled' ? 'PDF download cancelled' : `Could not download the PDF: ${t.error}`)
      return
    }
    toast(savedMessage(path), {
      action: { label: 'Show in folder',
        run: () => { call('files.show_here', { path }).catch((e: Error) => toast(`Could not show it: ${e.message}`)) } } })
  }, [toast])

  useEvent<Transfer>('transfer', (t) => {
    if (!t.finished) return
    const path = ours.current.get(t.id)
    if (path !== undefined) { ours.current.delete(t.id); report(t, path) }
    else if (asking.current > 0) early.current.set(t.id, t)
  })

  const download = useCallback(async () => {
    if (!state.ok || !pdf.path) return
    asking.current++
    try {
      const got = await call<{ id: string; path: string }>('files.download',
        { cluster, remote_path: pdf.path, local_dir: await openFolder(cluster), name: pdfName(folder, main) })
      const t = early.current.get(got.id)
      if (t) report(t, got.path)
      else { ours.current.set(got.id, got.path); toast(`Downloading ${fileOf(got.path)}…`) }
    } catch (e) {
      toast(`Could not download the PDF: ${(e as Error).message}`)
    } finally {
      if (--asking.current === 0) early.current.clear()
    }
  }, [state.ok, pdf.path, cluster, folder, main, report, toast])

  return { ...state, download }
}
