import { ArrowUp, ChevronsUpDown, GitBranch, Loader2 } from 'lucide-react'
import { type ReactNode, useCallback, useState } from 'react'

import type { GitState } from '../../../../types/history'
import { useOutside } from '../../useOutside'
import type { Where } from '../git'
import { BranchMenu } from './BranchMenu'
import { branchStatus } from './status'

type Busy = { label: string } | null

type BarProps = {
  where: Where
  state: GitState
  busy: Busy
  start: string  // the commit New branch starts from (the one selected, or HEAD)
  onSwitch: (target: string) => void
  onNewBranch: (name: string, start: string) => void
  onCompareBranch: (name: string) => void
  onLatest: () => void
  onPush: () => void
  agent: ReactNode
}

export function BranchBar({ where, state, busy, start, onSwitch, onNewBranch, onCompareBranch, onLatest, onPush,
  agent }: BarProps) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const box = useOutside(open, close)
  return (
    <div ref={box} className="relative flex h-11 shrink-0 items-center gap-2 border-t border-line pr-2 pl-2 text-sm">
      <button onClick={() => setOpen(!open)} disabled={!!busy} title="Switch branch"
        className={`flex h-8 items-center gap-1.5 rounded-md px-2 font-semibold ${open ? 'bg-selected' : 'hover:bg-hover'}`}>
        <GitBranch size={14} /> <span className="max-w-[120px] truncate">{state.branch || 'no branch'}</span>
        <ChevronsUpDown size={13} className="text-dim" /></button>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-dim">
        {busy ? <><Loader2 size={13} className="animate-spin" /> {busy.label}</> : branchStatus(state)}</span>
      {agent}
      {!busy && state.ahead > 0 && <button onClick={onPush} title="Pull first, then push"
        className="flex h-8 items-center gap-1 rounded-md px-2 font-semibold hover:bg-hover"><ArrowUp size={14} /> Push</button>}
      {open && <BranchMenu where={where} state={state} start={start}
        onSwitch={(b) => { setOpen(false); onSwitch(b) }} onNew={(n) => { setOpen(false); onNewBranch(n, start) }}
        onCompare={(b) => { setOpen(false); onCompareBranch(b) }} onLatest={() => { setOpen(false); onLatest() }} />}
    </div>
  )
}
