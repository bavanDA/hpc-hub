import { useState } from 'react'

import type { GitJob, GitState, SwitchCheck, SwitchDone } from '../../../types/history'
import { useToast } from '../../useToast'
import { lastLine } from './format'
import { git, type Where } from './git'
import { switchedText, switchSteps } from './jobText'
import type { Sel } from './list/CommitList'
import { useJob } from './useJob'
import { useSeconds } from './useSeconds'

type Switching = { id: string; target: string; brought: number; expected: string[] }

type Args = {
  where: Where
  state: GitState | null
  onSave: () => Promise<boolean>
  onPause: (paused: boolean) => void
  onFiles: () => void
  onBuild: () => void
  refresh: () => Promise<void>
  setSel: (s: Sel) => void
}

/** Switching branches: the check for changes, the job, and switching once the changes are committed. */
export function useSwitch({ where, state, onSave, onPause, onFiles, onBuild, refresh, setSel }: Args) {
  const toast = useToast()
  const [check, setCheck] = useState<SwitchCheck | null>(null)
  const [switching, setSwitching] = useState<Switching | null>(null)
  const [afterCommit, setAfterCommit] = useState<string | null>(null)

  const ask = async (target: string) => {
    if (!(await onSave())) return
    try {
      const c = await git<SwitchCheck>('switch_check', where, { target })
      if (!c.changes.length) void go(target, 'bring', c)
      else setCheck(c)
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  const go = async (target: string, mode: 'bring' | 'keep', c: SwitchCheck | null = check) => {
    setCheck(null)
    const n = c?.changes.length ?? 0
    const expected = switchSteps(n, state?.remotes.length ?? 0, c?.files ?? 0)
    onPause(true)
    try {
      const { id } = await git<{ id: string }>('switch', where, { target, mode })
      setSwitching({ id, target, brought: mode === 'bring' ? n : 0, expected })
    } catch (e) {
      onPause(false)
      toast(lastLine((e as Error).message), { kind: 'error' })
    }
  }
  const job = useJob(switching?.id ?? null, (j: GitJob) => {
    const target = switching?.target ?? ''
    setSwitching(null)
    onPause(false)
    onFiles()
    void refresh().then(() => setSel({ kind: 'now' }))
    if (!j.ok) { toast(`Could not switch: ${lastLine(j.error ?? '')}`, { kind: 'error' }); return }
    const r = j.result as SwitchDone
    onBuild()
    toast(switchedText(target, r), { action: { label: `Switch back to ${r.from}`, run: () => void ask(r.from) } })
  })
  const seconds = useSeconds(!!switching)

  const commitFirst = (target: string) => { setAfterCommit(target); setCheck(null) }
  const committed = () => {
    if (!afterCommit) return false
    const t = afterCommit
    setAfterCommit(null)
    void go(t, 'bring')
    return true
  }

  return { check, setCheck, switching, job, seconds, ask, go, commitFirst, committed }
}
