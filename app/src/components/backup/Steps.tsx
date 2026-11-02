// The backup agent's first two steps on the desktop: start (what it does, Check my scratch) and the check while it
// runs. Wording in copy.ts.
import { Bot, ShieldCheck, TimerOff } from 'lucide-react'
import { useState } from 'react'

import type { BackupPolicy, Scan } from '../../types/backup'
import { Button, Card, IconTile, Meter, Spinner, Switch } from '../ui'
import { count, scanning, start } from './copy'

export function StartStep({ name, policy, last, busy, onCheck, onLast }: {
  name: string; policy: BackupPolicy | null; last: Scan | null; busy: boolean
  onCheck: (everything: boolean, agent: string) => void; onLast: () => void
}) {
  const [agent, setAgent] = useState(true)
  const days = policy?.purge.days ?? 0
  const noTimer = !!policy && days <= 0
  return (
    <Card className="flex flex-col gap-5 p-6">
      <div className="flex items-start gap-4">
        <IconTile icon={noTimer ? TimerOff : ShieldCheck} size={56} />
        <p className="text-md">{!policy ? <Spinner /> : noTimer ? start.noTimer(name) : start.intro(name, days)}</p>
      </div>
      <label className="flex items-start gap-3">
        <Switch on={agent} onChange={setAgent} label={start.agent} />
        <span className="flex flex-col">
          <span className="flex items-center gap-1.5"><Bot size={14} className="text-dim" />{start.agent}</span>
          <span className="text-sm text-dim">{start.agentHint}</span>
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button kind="primary" size="lg" disabled={busy || !policy}
          onClick={() => onCheck(noTimer, agent ? 'claude' : '')}>{noTimer ? start.anyway : start.check}</Button>
        {last?.state === 'done' && <Button kind="ghost" onClick={onLast}>{start.seeLast}</Button>}
      </div>
      <p className="text-sm text-dim">{start.hint}</p>
    </Card>
  )
}

export function ScanningStep({ scan, onStop, onAgain }: { scan: Scan | null; onStop: () => void; onAgain: () => void }) {
  const p = scan?.progress ?? {}
  const share = p.expected ? (p.checked ?? 0) / p.expected : 0
  const failed = scan?.state === 'failed'
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        {!failed && <Spinner size={20} />}
        <h2 className="text-lg font-semibold">{failed ? scanning.failed : scanning.title}</h2>
      </div>
      <p className="text-md text-dim">{scan?.detail || 'Waiting for a node'}</p>
      {scan?.state === 'scanning' && p.expected ? (
        <div className="flex flex-col gap-1.5">
          <Meter value={share} label="Files checked" />
          <span className="text-sm text-dim tabular-nums">{count(p.checked ?? 0)} of {(p.checked ?? 0) >= p.expected
            ? '' : 'about '}{count(p.expected)}</span>
        </div>
      ) : null}
      <p className="text-sm text-dim">{start.hint}</p>
      <div>{failed ? <Button kind="primary" onClick={onAgain}>{scanning.again}</Button>
        : <Button onClick={onStop}>{scanning.stop}</Button>}</div>
    </Card>
  )
}
