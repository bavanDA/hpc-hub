import { useState } from 'react'

import type { Plan, Progress } from '../../types/backup'
import { Confirm } from '../e/Confirm'
import { EButton } from '../e/EButton'
import { Spinner } from '../ui/Spinner'
import { Actions } from './Actions'
import { Bar } from './Bar'
import { copying } from './copy'
import { gb } from './format'

export function CopyView({ plan, progress, job, onStop }: {
  plan: Plan | null; progress: Progress | null; job: string; onStop: () => void
}) {
  const [asking, setAsking] = useState(false)
  const total = progress?.total_bytes || plan?.bytes || 0
  const share = total ? (progress?.done_bytes ?? 0) / total : 0
  return (
    <div className="flex flex-col gap-3">
      <h2 className="flex items-center gap-3 px-5 text-lg font-semibold"><Spinner size={18} />
        {copying.title(gb(total))}</h2>
      <div className="px-5"><Bar value={share} label="Copied" /></div>
      <p className="px-5 text-dim tabular-nums">
        {progress?.state === 'verifying' ? copying.verifying : progress?.detail || 'Starting'}</p>
      {job && <p className="px-5 text-sm text-dim">{copying.job(job)}</p>}
      <Actions><EButton onClick={() => setAsking(true)}>{copying.stop}</EButton></Actions>
      {asking && <Confirm title={copying.stopTitle} keep={copying.keep} act={copying.stop}
        onAct={() => { setAsking(false); onStop() }} onClose={() => setAsking(false)}>
        <p>{copying.stopText}</p></Confirm>}
    </div>
  )
}
