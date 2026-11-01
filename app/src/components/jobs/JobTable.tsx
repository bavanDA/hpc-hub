// The job table: sortable columns, the state as a pill, and a ⋮ menu (details, cancel) on your own running or
// waiting jobs. Cancelling always asks first (CancelDialog).
import { ChevronDown, ChevronUp, MoreVertical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Job } from '../../types/jobs'
import { STATE_PILL, queue, stateName, type SortKey } from './format'

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
    <table className="w-full border-collapse text-sm tabular-nums">
      <thead className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--color-line)]">
        <tr className="text-left text-sm text-dim">
          {cols.map(([key, title]) => (
            <th key={key} aria-sort={sort.key === key ? (sort.desc ? 'descending' : 'ascending') : undefined}
              className={`p-0 font-semibold ${key === 'name' ? 'w-full' : ''} ${key === 'id' ? 'pl-2' : ''}`}>
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
              {(showUser || j.from_app) && <div className="truncate text-xs leading-tight text-dim">
                {[showUser && j.user, j.from_app && 'started by HPC Hub'].filter(Boolean).join(' · ')}</div>}
            </td>
            <td className="px-2 leading-tight whitespace-nowrap" title={queue(j)}>{j.partition}
              {j.qos && <div className="text-xs text-dim">{j.qos}</div>}</td>
            <td className="px-2">
              <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                STATE_PILL[j.state] ?? 'bg-pill'}`}>{stateName(j.state)}</span></td>
            <td className="px-2 leading-tight whitespace-nowrap">{j.elapsed}
              <div className="text-xs text-dim">of {j.limit}</div></td>
            <td className="px-2 whitespace-nowrap">{j.cpus} · {j.mem}</td>
            <td className={`px-2 leading-tight whitespace-nowrap ${j.su === 'free' ? 'text-dim' : ''}`}>{spent}
              {max && <div className="text-xs text-dim">of {max}</div>}</td>
            <td className="max-w-[160px] truncate px-2 whitespace-nowrap" title={j.where}>{j.where}</td>
            {anyCancel && (
              <td className="pr-2 pl-1 text-right">
                {j.cancellable && <RowMenu onDetails={() => onOpen(j)} onCancel={() => onCancel(j)} />}
              </td>
            )}
          </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** ⋮ on a row: details, and cancel (which asks first). */
function RowMenu({ onDetails, onCancel }: { onDetails: () => void; onCancel: () => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [open])
  const pick = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); setOpen(false); fn() }
  return (
    <div ref={box} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button aria-label="Job actions" title="Job actions" aria-expanded={open} onClick={() => setOpen(!open)}
        className="grid size-8 place-items-center rounded-md hover:bg-selected"><MoreVertical size={16} /></button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-xl bg-card p-1 text-left
          shadow-[0_0_0_1px_var(--color-line),0_6px_20px_rgb(0_0_0/0.25)]">
          <button role="menuitem" onClick={pick(onDetails)}
            className="flex h-9 w-full items-center rounded-md px-3 hover:bg-hover">Details</button>
          <button role="menuitem" onClick={pick(onCancel)}
            className="flex h-9 w-full items-center rounded-md px-3 font-semibold text-bad hover:bg-hover">Cancel job…</button>
        </div>
      )}
    </div>
  )
}
