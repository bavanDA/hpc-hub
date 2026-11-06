import { ChevronDown, ChevronUp } from 'lucide-react'

import type { Job } from '../../types/jobs'
import { COLUMNS, type Sort } from './columns'
import { JobRow } from './JobRow'
import { Tick } from './Tick'

export function JobTable({ jobs, showUser, sort, onSort, onOpen, onCancel, picked, onPick }: {
  jobs: Job[]; showUser: boolean; sort: Sort; onSort: (s: Sort) => void
  onOpen: (j: Job) => void; onCancel: (j: Job) => void
  picked: Set<string>; onPick: (ids: Set<string>) => void  // job ids ticked to cancel together
}) {
  const cols = COLUMNS.filter((c) => c.key !== 'user' || showUser)
  const anyCancel = jobs.some((j) => j.cancellable)
  const mine = jobs.filter((j) => j.cancellable).map((j) => j.job_id)
  const all = mine.length > 0 && mine.every((id) => picked.has(id))
  const flip = (id: string) => {
    const next = new Set(picked)
    if (!next.delete(id)) next.add(id)
    onPick(next)
  }
  return (
    <table className="w-full border-collapse text-base">
      <thead className="sticky top-0 z-10 bg-window shadow-[inset_0_-1px_0_var(--color-line)]">
        <tr className="text-left text-xs font-semibold text-dim">
          {anyCancel && <th className="w-10 pl-4">
            <Tick label="Pick all your jobs" checked={all} onChange={() => onPick(new Set(all ? [] : mine))} /></th>}
          {cols.map((c, i) => (
            <th key={c.key} aria-sort={sort.key === c.key ? (sort.desc ? 'descending' : 'ascending') : undefined}
              className={`p-0 font-semibold ${c.grow ? 'w-full' : ''} ${c.hide ?? ''}`}>
              <button onClick={() => onSort({ key: c.key, desc: sort.key === c.key ? !sort.desc : c.key === 'id' })}
                className={`flex h-9 w-full items-center gap-1 px-3 whitespace-nowrap ${i || anyCancel ? '' : 'pl-4'} hover:text-text
                  ${c.right ? 'justify-end' : ''}`}>
                {c.title}
                {sort.key === c.key && (sort.desc ? <ChevronDown size={14} /> : <ChevronUp size={14} />)}
              </button>
            </th>
          ))}
          {anyCancel && <th aria-label="Actions"
            className="sticky right-0 w-10 bg-window shadow-[inset_0_-1px_0_var(--color-line)]" />}
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => <JobRow key={j.job_id} job={j} cols={cols} anyCancel={anyCancel}
          picked={picked.has(j.job_id)} onPick={() => flip(j.job_id)}
          onOpen={() => onOpen(j)} onCancel={() => onCancel(j)} />)}
      </tbody>
    </table>
  )
}
