// The backup agent's first two steps on the desktop: start (what it does, Check my scratch) and the check while it
// runs. Wording in copy.ts. Style E, like the phone's StartView and ScanView.
import { useState } from 'react'

import type { BackupPolicy, Scan } from '../../types/backup'
import { agentIcon } from '../agents/AgentIcon'
import { EButton, IconToggleRow } from '../e/extra'
import { List, Row } from '../e/ui'
import { Spinner } from '../ui'
import { count, scanning, start } from './copy'

/** How far a check or a copy is: black (white on dark) on grey, never red. */
export function Bar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}
      className="h-1.5 overflow-hidden rounded-full bg-soft">
      <div className="h-full rounded-full bg-text transition-[width] duration-200" style={{ width: `${v * 100}%` }} />
    </div>
  )
}

/** The step's buttons, under its rows: the main one solid. */
export function Actions({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 px-5 pt-5">{children}</div>
}

export function StartStep({ name, policy, last, busy, onCheck, onLast }: {
  name: string; policy: BackupPolicy | null; last: Scan | null; busy: boolean
  onCheck: (everything: boolean, agent: string) => void; onLast: () => void
}) {
  const [agent, setAgent] = useState(true)
  const days = policy?.purge.days ?? 0
  const noTimer = !!policy && days <= 0
  return (
    <>
      <p className="px-5 pb-5 text-md">{!policy ? <Spinner /> : noTimer ? start.noTimer(name) : start.intro(name, days)}</p>
      <List>
        <IconToggleRow icon={agentIcon('claude')} label={start.agent} sub={start.agentHint} checked={agent}
          onChange={setAgent} />
        {last?.state === 'done' && <Row label={start.seeLast} opens onPress={onLast} />}
      </List>
      <p className="px-5 pt-2 text-sm text-dim">{start.hint}</p>
      <Actions>
        <EButton kind="primary" disabled={busy || !policy} onClick={() => onCheck(noTimer, agent ? 'claude' : '')}>
          {noTimer ? start.anyway : start.check}</EButton>
      </Actions>
    </>
  )
}

export function ScanningStep({ scan, onStop, onAgain }: { scan: Scan | null; onStop: () => void; onAgain: () => void }) {
  const p = scan?.progress ?? {}
  const share = p.expected ? (p.checked ?? 0) / p.expected : 0
  const failed = scan?.state === 'failed'
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 px-5 text-lg font-semibold">{!failed && <Spinner size={18} />}
        {failed ? scanning.failed : scanning.title}</h2>
      {scan?.state === 'scanning' && p.expected
        ? <div className="px-5"><Bar value={share} label="Files checked" /></div> : null}
      <p className="px-5 text-dim tabular-nums">{scan?.detail || (p.expected
        ? `${count(p.checked ?? 0)} of about ${count(p.expected)} files` : 'Waiting for a node')}</p>
      {!failed && <p className="px-5 text-sm text-dim">{start.hint}</p>}
      <Actions>{failed ? <EButton kind="primary" onClick={onAgain}>{scanning.again}</EButton>
        : <EButton onClick={onStop}>Stop checking</EButton>}</Actions>
    </div>
  )
}
