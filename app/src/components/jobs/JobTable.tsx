// The job table: sortable columns, state in color, a Cancel button on your own running or waiting jobs.
import { ChevronDown, ChevronUp, X } from 'lucide-react'

import type { Job } from '../../types/jobs'
import { STATE_COLOR, queue, type SortKey } from './format'

const COLUMNS: [SortKey, string][] = [
  ['id', 'ID'], ['name', 'Name'], ['queue', 'Partition · QoS'], ['state', 'State'],
  ['time', 'Time / limit'], ['res', 'CPUs · mem'], ['su', 'SU used / max'], ['where', 'Node / reason'],
]

export type Sort = { key: SortKey; desc: boolean }

export function JobTable({ jobs, showUser, sort, onSort, onOpen, onCancel }: {
  jobs: Job[]; showUser: boolean; sort: Sort; onSort: (s: Sort) => void
  onOpen: (j: Job) => void; onCancel: (j: Job) => void
}) {
  // All jobs: whose job shows under its name, so the table still fits beside the sidebar
  const cols = COLUMNS.map(([k, t]) => [k, k === 'name' && showUser ? 'Name · user' : t] as const)
  const anyCancel = jobs.some((j) => j.cancellable)
  return (
    <table className="w-full border-collapse text-[13.5px] tabular-nums">
      <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--color-line)]">
        <tr className="text-left text-[13px] text-dim">
          {cols.map(([key, title]) => (
            <th key={key} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}
              className={`p-0 font-bold ${key === 'name' ? 'w-full' : ''} ${key === 'id' ? 'pl-2' : ''}`}>
              <button onClick={() => onSort({ key, desc: sort.key === key ? !sort.desc : key === 'id' })}
                className="flex h-9 w-full items-center gap-1 px-2 whitespace-nowrap hover:text-text">
                {title}
                {sort.key === key && (sort.desc ? <ChevronDown size={14} /> : <ChevronUp size={14} />)}
              </button>
            </th>
          ))}
          {anyCancel && <th />}
        </tr>
      </thead>
      <tbody>
        {jobs.map((j) => {
          const [spent, max] = j.su.split(' / ')
          return (
          <tr key={j.job_id} onClick={() => onOpen(j)} title="Show details"
            className="h-12 border-b border-line last:border-0 hover:bg-hover">
            <td className="pr-2 pl-4 whitespace-nowrap">{j.job_id}</td>
            <td className="max-w-0 min-w-[100px] px-2">
              <div className="truncate leading-tight" title={j.name}>{j.name}</div>
              {(showUser || j.from_app) && <div className="truncate text-[12px] leading-tight text-dim">
                {[showUser && j.user, j.from_app && 'started by HPC Hub'].filter(Boolean).join(' · ')}</div>}
            </td>
            <td className="px-2 leading-tight whitespace-nowrap" title={queue(j)}>{j.partition}
              {j.qos && <div className="text-[12px] text-dim">{j.qos}</div>}</td>
            <td className={`max-w-28 px-2 leading-tight font-bold ${STATE_COLOR[j.state] ?? ''}`}>
              {j.state.replaceAll('_', ' ')}</td>
            <td className="px-2 leading-tight whitespace-nowrap">{j.elapsed}
              <div className="text-[12px] text-dim">of {j.limit}</div></td>
            <td className="px-2 whitespace-nowrap">{j.cpus} · {j.mem}</td>
            <td className={`px-2 leading-tight whitespace-nowrap ${j.su === 'free' ? 'text-dim' : ''}`}>{spent}
              {max && <div className="text-[12px] text-dim">of {max}</div>}</td>
            <td className="max-w-[160px] truncate px-2 whitespace-nowrap" title={j.where}>{j.where}</td>
            {anyCancel && (
              <td className="pr-3 pl-2 text-right">
                {j.cancellable && (
                  <button onClick={(e) => { e.stopPropagation(); onCancel(j) }} title="Cancel this job…"
                    aria-label="Cancel this job" className="inline-flex h-7 min-w-7 items-center justify-center gap-1
                      rounded-md bg-bad-bg px-1.5 text-[13px] font-bold text-bad hover:brightness-110 @[920px]:px-2.5">
                    <X size={15} strokeWidth={2.5} /><span className="hidden @[920px]:inline">Cancel</span></button>
                )}
              </td>
            )}
          </tr>
          )
        })}
      </tbody>
    </table>
  )
}
