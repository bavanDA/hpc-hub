import { useCallback, useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { PdfInfo } from '../../types/latex'
import { readFile } from '../pdf/load'

export type PdfState = { data: Uint8Array | null; path?: string; none?: boolean; error?: string }

/** The built PDF of a project, read again with reload. */
export function useBuiltPdf(cluster: string, main: string) {
  const [pdf, setPdf] = useState<PdfState>({ data: null })
  const [progress, setProgress] = useState(0)

  const read = useCallback(() => {
    call<PdfInfo | null>('latex.pdf', { cluster, main })
      .then((info) => info ? readFile(cluster, info.path, setProgress).then((data) => setPdf({ data, path: info.path }))
        : setPdf({ data: null, none: true }))
      .catch((e: Error) => setPdf({ data: null, error: e.message }))
  }, [cluster, main])
  const reload = useCallback(() => { setProgress(0); read() }, [read])
  useEffect(read, [read])  // read, not reload: progress is 0 on mount, so no extra render

  return { pdf, progress, reload }
}
