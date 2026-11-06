import type { Job } from '../../types/jobs'
import { Meter } from '../ui'
import { timeShare } from './format'

/** Running: a small bar and "1 h 12 min of 4 h". Waiting: "not started". Timed out: a full red bar. */
export function TimeUsed({ job: j }: { job: Job }) {
  if (j.state === 'PENDING') return <span className="text-dim">not started</span>
  return (
    <span className="flex items-center gap-2" title={`${j.elapsed_text} of ${j.limit_text}`}>
      {j.limit_seconds > 0 && <Meter value={timeShare(j)} label="Time used" className="w-9 shrink-0" />}
      <span>{j.elapsed_text}</span>
      <span className="text-sm text-dim @max-[820px]:hidden">of {j.limit_text}</span>
    </span>
  )
}
