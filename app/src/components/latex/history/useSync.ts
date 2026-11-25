import { useCallback, useEffect, useRef, useState } from 'react'

import type { CallError } from '../../../rpc'
import type { GitJob, GitState, HCommit, Pick, SyncDone, SyncState } from '../../../types/history'
import { useToast } from '../../useToast'
import { type GhDetails, ghDetails } from '../git/github'
import { lastLine } from './format'
import { git, type Where } from './git'
import { syncedText } from './jobText'
import type { Sel } from './list/CommitList'
import { newCommits } from './newCommits'
import { useJob } from './useJob'

// gh: GitHub turned down the sign-in, with what gh is like on the cluster (the guide to sign in with gh)
type Run = { id: string; push: boolean; error: string; gh?: GhDetails | null }

// A push or Get the latest that GitHub turned down, kept while you sign in with gh in Terminals: back on the paper
// it is shown again, with Try again
const failed = new Map<string, Run>()
const key = (w: Where) => `${w.cluster}:${w.folder}`

type Args = {
  where: Where
  commits: () => HCommit[]  // read when a push starts
  onSave: () => Promise<boolean>
  onPause: (paused: boolean) => void
  onFiles: () => void
  refresh: () => Promise<void>
  setSel: (s: Sel) => void
}

/** Push and Get the latest: the job, a pause to settle clashes, and the commits that came in. */
export function useSync({ where, commits, onSave, onPause, onFiles, refresh, setSel }: Args) {
  const toast = useToast()
  const [run, setRunState] = useState<Run | null>(() => failed.get(key(where)) ?? null)
  const setRun = useCallback((next: Run | null | ((r: Run | null) => Run | null)) => setRunState((r) => {
    const v = typeof next === 'function' ? next(r) : next
    if (v?.gh) failed.set(key(where), v)
    else failed.delete(key(where))
    return v
  }), [where])
  const [paused, setPaused] = useState<SyncState | null>(null)
  const [settling, setSettling] = useState(false)
  const [pulled, setPulled] = useState<Set<string>>(new Set())
  const before = useRef<HCommit[]>([])
  const shown = useRef(run)
  useEffect(() => {  // back from signing in with gh: the push that GitHub turned down, with Try again
    if (shown.current) { shown.current = null; setSel({ kind: 'sync' }) }
  }, [setSel])

  // a push paused before this tab opened; true when git was mid sync
  const resume = useCallback(async (st: GitState) => {
    if (!st.syncing) return false
    const s = await git<SyncState | null>('sync_state', where)
    if (s) { setPaused(s); setRun({ id: '', push: s.push, error: '' }); setSel({ kind: 'sync' }); onPause(true) }
    return true
  }, [where, onPause, setSel, setRun])

  const start = async (push: boolean) => {
    if (!(await onSave())) return
    before.current = commits()
    setPaused(null)
    setSel({ kind: 'sync' })
    onPause(true)
    try {
      const { id } = await git<{ id: string }>('sync', where, { push })
      setRun({ id, push, error: '' })
    } catch (e) {
      onPause(false)
      const err = e as CallError
      setRun({ id: '', push, error: lastLine(err.message), gh: ghDetails(err.kind, err.details) })
    }
  }
  const job = useJob(run?.id || null, (j: GitJob) => {
    const r = j.result as (SyncDone | SyncState | undefined)
    if (!j.ok) {
      setRun((x) => x && { ...x, error: lastLine(j.error ?? 'It did not work'), gh: ghDetails(j.error_kind, j.details) })
      onPause(false)
      onFiles()
      void refresh()
      return
    }
    if (r && 'done' in r && r.done) {
      setRun(null)
      setPaused(null)
      onPause(false)
      onFiles()
      toast(syncedText(r))
      void refresh().then(() => setSel({ kind: 'now' }))
      if (r.pulled) {
        git<HCommit[]>('log', where, { limit: r.pulled + r.pushed + 5 })
          .then((l) => setPulled(newCommits(before.current, l))).catch(() => {})
      }
    } else if (r) {
      setPaused(r as SyncState)
      void refresh()
    }
  })
  const settle = async (picks: Record<string, Pick[]>) => {
    setSettling(true)
    try {
      for (const [path, p] of Object.entries(picks)) await git('settle', where, { path, picks: p })
      const { id } = await git<{ id: string }>('sync_continue', where)
      setRun((x) => ({ id, push: x?.push ?? true, error: '' }))
      setPaused(null)
    } catch (e) {
      toast(lastLine((e as Error).message), { kind: 'error' })
    } finally { setSettling(false) }
  }
  const stop = async () => {
    setSettling(true)
    try {
      const r = await git<{ stopped: boolean; kept: boolean }>('sync_stop', where)
      toast(r.kept ? 'Stopped. Your changes are in Saved versions.' : 'Stopped. Everything is back as it was.')
    } catch (e) {
      toast(lastLine((e as Error).message), { kind: 'error' })
    } finally {
      setSettling(false)
      setRun(null)
      setPaused(null)
      onPause(false)
      onFiles()
      void refresh().then(() => setSel({ kind: 'now' }))
    }
  }

  return { run, paused, settling, pulled, job, resume, start, settle, stop }
}
