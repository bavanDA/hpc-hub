import { useCallback, useEffect, useRef, useState } from 'react'

import type { GitState, HCommit, Refs, SavedVersion } from '../../../types/history'
import { git, type Where } from './git'

export function useRepo(where: Where, active: boolean, onFirst: (st: GitState, log: HCommit[]) => Promise<void>) {
  const [state, setState] = useState<GitState | null>(null)
  const [commits, setCommits] = useState<HCommit[]>([])
  const [saved, setSaved] = useState<SavedVersion[]>([])
  const [refs, setRefs] = useState<Refs | null>(null)
  const [error, setError] = useState('')
  const first = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const st = await git<GitState>('state', where)
      setState(st)
      setError('')
      if (!st.root) return
      const [log, sv] = await Promise.all([git<HCommit[]>('log', where), git<SavedVersion[]>('saved', where)])
      setCommits(log)
      setSaved(sv)
      git<Refs>('refs', where).then(setRefs).catch(() => {})
      if (first.current) {
        first.current = false
        await onFirst(st, log)
      }
    } catch (e) { setError((e as Error).message) }
  }, [where, onFirst])
  useEffect(() => { if (active) void refresh() }, [active, refresh])

  return { state, setState, commits, saved, refs, error, refresh }
}
