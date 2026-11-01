// One job in the list: name and state, then why it waits or how long it ran, then id, person, cores and node.
import { Meter, StatusPill } from '@shared/components/ui'
import { stateName } from '@shared/components/jobs/format'
import type { Job } from '@shared/types/jobs'

/** How far into its time limit a job is, as the bar shows it: full when it ran out. */
export const timeUsed = (j: Job) => (j.state === 'TIMEOUT' ? 1 : j.limit_seconds ? j.seconds / j.limit_seconds : 0)

export function JobTime({ job: j }: { job: Job }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {j.limit_seconds > 0 && <Meter value={timeUsed(j)} label="Time used" className="w-12 shrink-0" />}
      <span className="tabular-nums">{j.elapsed_text || '0 min'}</span>
      {j.limit_text && <span className="text-dim">of {j.limit_text}</span>}
    </div>
  )
}

export function JobRow({ job: j, showUser, onOpen }: { job: Job; showUser: boolean; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="w-full rounded-2xl bg-card p-4 text-left shadow-[var(--shadow-card)]
      active:bg-hover">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{j.name || `Job ${j.job_id}`}</span>
        <StatusPill state={j.state}>{stateName(j.state)}</StatusPill>
      </div>
      <div className="mt-1.5">
        {j.reason ? <p className="truncate text-sm text-dim">{j.reason}</p> : <JobTime job={j} />}
      </div>
      <p className="mt-1 truncate text-sm text-dim tabular-nums">
        {[j.job_id, showUser ? j.user : '', `${j.cpus} cores`, j.partition, j.reason ? '' : j.where]
          .filter(Boolean).join(' · ')}</p>
    </button>
  )
}
