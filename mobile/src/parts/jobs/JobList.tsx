// The desktop's jobs table as a phone's list: ticks to cancel several, name with id and node or why it waits under it,
// state, time used, and ⋮ (Details, Cancel job, which asks first). Cores, memory and SU are in the details.
import { Check, ChevronDown, ChevronUp, MoreVertical } from 'lucide-react'

import type { Sort } from '@shared/components/jobs/columns'
import { reasonText, stateName, timeShare } from '@shared/components/jobs/format'
import { Meter } from '@shared/components/ui/Meter'
import type { Job } from '@shared/types/jobs'
import { Menu, StatusDot, type Tone } from '../../ui'

const STATE_COLUMN = 'w-[72px] shrink-0'
const TIME_COLUMN = 'w-[100px] shrink-0'
const stop = (e: React.SyntheticEvent) => e.stopPropagation()

function tone(state: string): Tone {
  const st = state.split(' ')[0]
  if (st === 'RUNNING') return 'on'
  if (st === 'PENDING' || st === 'COMPLETING') return 'busy'
  return ['FAILED', 'TIMEOUT', 'OUT_OF_MEMORY', 'NODE_FAIL', 'BOOT_FAIL', 'DEADLINE'].includes(st) ? 'error' : 'off'
}

function Tick({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={onChange}
      className={`relative grid size-5 place-items-center rounded-[5px] border-[1.5px] after:absolute after:-inset-3 ${
        checked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'}`}>
      {checked && <Check size={14} strokeWidth={3} />}
    </button>
  )
}

function TimeUsed({ job: j }: { job: Job }) {
  if (j.state === 'PENDING') return <span className="text-dim">not started</span>
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      {j.limit_seconds > 0 && <Meter value={timeShare(j)} label="Time used" className="w-[22px] shrink-0" />}
      {j.elapsed_text}
    </span>
  )
}

export function JobHead({ sort, onSort, jobs, picked, onPick }: {
  sort: Sort; onSort: (s: Sort) => void; jobs: Job[]; picked: Set<string>; onPick: (ids: Set<string>) => void
}) {
  const mine = jobs.filter((j) => j.cancellable).map((j) => j.job_id)
  const all = mine.length > 0 && mine.every((id) => picked.has(id))
  const column = (key: Sort['key'], title: string, cls: string) => (
    <button type="button" onClick={() => onSort({ key, desc: sort.key === key ? !sort.desc : false })}
      className={`flex h-full items-center gap-1 ${cls}`}>
      {title}{sort.key === key && (sort.desc ? <ChevronDown size={14} /> : <ChevronUp size={14} />)}
    </button>
  )
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 border-y border-line pr-12 pl-3 text-xs font-semibold text-dim">
      {mine.length > 0 && <span className="w-5 shrink-0">
        <Tick label="Pick all your jobs" checked={all} onChange={() => onPick(new Set(all ? [] : mine))} /></span>}
      {column('name', 'Name', 'min-w-0 flex-1')}
      {column('state', 'State', STATE_COLUMN)}
      {column('time', 'Time used', TIME_COLUMN)}
    </div>
  )
}

export function JobRow({ job: j, showUser, anyCancel, picked, onPick, onOpen, onCancel }: {
  job: Job; showUser: boolean; anyCancel: boolean; picked: boolean; onPick: () => void; onOpen: () => void
  onCancel: () => void
}) {
  const t = tone(j.state)
  return (
    <div onClick={onOpen} className={`flex min-h-[60px] items-center gap-2 border-b
      border-line py-1.5 pr-1 pl-3 active:bg-pressed ${picked ? 'bg-selected' : ''}`}>
      {anyCancel && <div className="w-5 shrink-0" onClick={stop}>
        {j.cancellable && <Tick label={`Pick job ${j.job_id}`} checked={picked} onChange={onPick} />}</div>}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 [overflow-wrap:anywhere]">{j.name}</span>
          {j.from_app && <span className="text-sm whitespace-nowrap text-dim">HPC Hub</span>}
        </div>
        <div className="flex flex-col text-sm text-dim">
          {showUser && <span className="[overflow-wrap:anywhere]">{j.user}</span>}
          <span className="tabular-nums">{j.job_id}</span>
          {j.reason ? <span>{reasonText(j.reason)}</span>
            : j.where && <span className="font-mono text-text [overflow-wrap:anywhere]">{j.where}</span>}
        </div>
      </div>
      <span className={`flex items-center gap-1.5 text-sm font-semibold ${STATE_COLUMN} ${t === 'error' ? 'text-bad' : ''}`}>
        <StatusDot tone={t} /><span className="min-w-0">{stateName(j.state)}</span>
      </span>
      <div className={`text-sm ${TIME_COLUMN}`}><TimeUsed job={j} /></div>
      {anyCancel && (
        <div className="size-9 shrink-0" onClick={stop}>
          {j.cancellable && <Menu label="Job actions" trigger={<MoreVertical size={18} />}
            className="grid size-9 place-items-center rounded-md text-dim active:bg-pressed"
            groups={[[{ label: 'Details', onClick: onOpen }, { label: 'Cancel job…', danger: true, onClick: onCancel }]]} />}
        </div>
      )}
    </div>
  )
}
