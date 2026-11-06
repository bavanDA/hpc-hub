import { useCallback, useEffect, useRef, useState } from 'react'

import { useEvent } from '../../../../hooks'
import type { PdfJob } from '../../../../types/history'
import { readFile } from '../../../pdf/load'
import { git, type Where } from '../git'

type BuildState = { data: Uint8Array | null; error: string; seconds: number; cached: boolean; started: number }

export function useBuilt(where: Where, main: string, version: string, against: string | null, guard: (run: () => void) => void,
  skip = false) {
  const [st, setSt] = useState<BuildState>({ data: null, error: '', seconds: 0, cached: false, started: 0 })
  const [job, setJob] = useState('')
  const guardNow = useRef(guard)
  guardNow.current = guard
  const load = useCallback((path: string, seconds: number, cached: boolean) => {
    readFile(where.cluster, path).then((data) => setSt({ data, error: '', seconds, cached, started: 0 }))
      .catch((e: Error) => setSt((s) => ({ ...s, error: e.message, started: 0 })))
  }, [where])
  const start = useCallback(() => {
    setSt({ data: null, error: '', seconds: 0, cached: false, started: 0 })
    const go = () => {
      setSt((s) => ({ ...s, started: Date.now() }))
      git<{ path?: string; id?: string }>('pdf', where, { main, version, against })
        .then((r) => r.path ? load(r.path, 0, true) : setJob(r.id ?? ''))
        .catch((e: Error) => setSt((s) => ({ ...s, error: e.message, started: 0 })))
    }
    guardNow.current(go)
  }, [where, main, version, against, load])
  useEffect(() => { if (!skip) start() }, [skip, start])
  useEvent<PdfJob>('latex-git-pdf', (e) => {
    if (e.id !== job) return
    setJob('')
    if (e.ok) load(e.path, e.seconds, false)
    else setSt((s) => ({ ...s, error: e.error, started: 0 }))
  })
  return { ...st, retry: start }
}
