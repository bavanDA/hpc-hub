import { useCallback, useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { JobList, Scope } from '../../types/jobs'

const REFRESH_MS = 15_000

/** jobs.list for one cluster, scope and group, refreshed every 15 s while the window shows. Another view shows
 * nothing until its own answer is in; answers to an older one are dropped. */
export function useJobList(cluster: string, scope: Scope, account: string, connected: boolean) {
  const [got, setGot] = useState({ key: '', list: null as JobList | null, error: '', updated: '' })
  const [loading, setLoading] = useState(false)
  const turn = useRef(0)
  const busy = useRef(false)
  const key = `${cluster}|${scope}|${account}`

  const refresh = useCallback((quiet = false) => {
    if (!cluster || !connected || (quiet && busy.current)) return
    const mine = ++turn.current
    const asked = `${cluster}|${scope}|${account}`
    busy.current = true
    setLoading(true)
    call<JobList>('jobs.list', { cluster, scope, account })
      .then((d) => mine === turn.current &&
        setGot({ key: asked, list: d, error: '', updated: new Date().toLocaleTimeString('en-GB') }))
      .catch((e: Error) => mine === turn.current && setGot({ key: asked, list: null, error: e.message, updated: '' }))
      .finally(() => {
        if (mine !== turn.current) return
        busy.current = false
        setLoading(false)
      })
  }, [cluster, scope, account, connected])

  useEffect(() => refresh(), [refresh])
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(true), REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  const fresh = got.key === key
  return { key, list: fresh ? got.list : null, error: fresh ? got.error : '', updated: got.updated, loading, refresh }
}
