// One job in the list, as a row: name and state, then why it waits or how long it ran, then id, person, cores, node.
import type { Job } from '@shared/types/jobs'
import { StatusDot } from '../../ui'
import { Bar } from '../usage/Bar'
import { reasonText } from './filters'
import { cores, stateTone, stateWord } from './words'

/** How far into its time limit a job is, as the bar shows it: full when it ran out. */
export const timeUsed = (j: Job) => (j.state === 'TIMEOUT' ? 1 : j.limit_seconds ? j.seconds / j.limit_seconds : 0)

/** "3 h 41 min of 12 h" */
export const timeText = (j: Job) => [j.elapsed_text || '0 min', j.limit_text && `of ${j.limit_text}`]
  .filter(Boolean).join(' ')

export function JobState({ state }: { state: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-sm font-medium">
      <StatusDot tone={stateTone(state)} />
      <span className={stateTone(state) === 'error' ? 'text-bad' : ''}>{stateWord(state)}</span>
    </span>
  )
}

export function JobTime({ job: j }: { job: Job }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="tabular-nums">{timeText(j)}</span>
      {j.limit_seconds > 0 && <Bar value={timeUsed(j)} label="Time used" />}
    </div>
  )
}

export function JobRow({ job: j, showUser, onOpen }: { job: Job; showUser: boolean; onOpen: () => void }) {
  const facts = [j.job_id, showUser ? j.user : '', cores(j.cpus), j.reason ? '' : j.where].filter(Boolean)
  return (
    <button onClick={onOpen} className="flex min-h-14 w-full flex-col gap-0.5 border-b border-line px-4 py-2.5
      text-left active:bg-pressed">
      <span className="flex w-full items-baseline gap-3">
        <span className="min-w-0 flex-1 font-medium break-words">{j.name || `Job ${j.job_id}`}</span>
        <JobState state={j.state} />
      </span>
      <span className="text-sm break-words text-dim tabular-nums">{j.reason ? reasonText(j.reason) : timeText(j)}</span>
      <span className="text-sm break-words text-dim tabular-nums">{facts.join(' · ')}</span>
    </button>
  )
}
