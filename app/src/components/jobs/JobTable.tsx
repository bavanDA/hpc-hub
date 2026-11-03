// The job table: one line per job, sortable columns, the state as a dot and a word, time used as a bar, a ⋮ menu (details,
// cancel) on your own running or waiting jobs, pinned to the right, and a box to pick several to cancel at once.
// Cancelling always asks first (CancelDialog, CancelManyDialog).
// Narrow windows drop the less important columns (container queries) instead of scrolling sideways, and the name
// wraps instead of being cut.
import { ChevronDown, ChevronUp, MoreVertical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { Job } from '../../types/jobs'
import { Meter, StatusPill } from '../ui'
import { memText, reasonText, stateName, type SortKey } from './format'

type Column = { key: SortKey; title: string; right?: boolean; hide?: string; grow?: boolean }
// hide: the container width under which the column goes
const NUMBERS = new Set<SortKey>(['id', 'time', 'res', 'su'])  // tabular figures here only: they widen hyphens
const COLUMNS: Column[] = [
  { key: 'id', title: 'ID' },
  { key: 'name', title: 'Name', grow: true },
  { key: 'user', title: 'User', hide: '@max-[760px]:hidden' },
  { key: 'state', title: 'State' },
  { key: 'time', title: 'Time used' },
  { key: 'res', title: 'CPUs · memory', right: true, hide: '@max-[940px]:hidden' },
  { key: 'su', title: 'Hours (SU)', right: true, hide: '@max-[1000px]:hidden' },
  { key: 'where', title: 'Node or reason', hide: '@max-[640px]:hidden' },
]

export type Sort = { key: SortKey; desc: boolean }

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

function JobRow({ job: j, cols, anyCancel, picked, onPick, onOpen, onCancel }: {
  job: Job; cols: Column[]; anyCancel: boolean; picked: boolean; onPick: () => void; onOpen: () => void
  onCancel: () => void
}) {
  const [menu, setMenu] = useState(false)
  const cell = (c: Column): React.ReactNode => {
    switch (c.key) {
      case 'id': return <span className="text-dim">{j.job_id}</span>
      case 'name': return (
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="min-w-0 [overflow-wrap:anywhere]">{j.name}</span>
          {/* the HPC Hub mark goes under the name when the two don't fit */}
          {j.from_app && <span className="text-sm whitespace-nowrap text-dim">HPC Hub</span>}
        </span>)
      case 'user': return <span className="text-dim">{j.user}</span>
      case 'state': return <StatusPill state={j.state}>{stateName(j.state)}</StatusPill>
      case 'time': return <TimeUsed job={j} />
      case 'res': return <>{j.cpus} · {memText(j.mem)}</>
      case 'su': return <span className={j.su === 'free' ? 'text-dim' : ''}>{j.su}</span>
      case 'where': return j.reason
        ? <span className="block max-w-[200px] truncate text-dim @max-[820px]:max-w-[120px]" title={reasonText(j.reason)}>{reasonText(j.reason)}</span>
        : <span className="block max-w-[180px] truncate font-mono text-sm" title={j.where}>{j.where}</span>
      default: return null
    }
  }
  return (
    <tr onClick={onOpen} title="Show details"
      className={`group h-11 cursor-default border-b border-line hover:bg-hover ${picked ? 'bg-selected' : ''}`}>
      {anyCancel && <td className="w-10 pl-4" onClick={(e) => e.stopPropagation()}>
        {j.cancellable && <Tick label={`Pick job ${j.job_id}`} checked={picked} onChange={onPick} />}</td>}
      {cols.map((c) => (
        <td key={c.key} className={`px-3 ${c.grow ? 'py-1.5' : 'whitespace-nowrap'}
          ${NUMBERS.has(c.key) ? 'tabular-nums' : ''} ${anyCancel ? '' : 'first:pl-4'} ${c.right ? 'text-right' : ''}
          ${c.grow ? 'max-w-0 min-w-[160px]' : ''} ${c.hide ?? ''}`}>{cell(c)}</td>
      ))}
      {anyCancel && (
        <td className={`sticky right-0 pr-2 pl-1 text-right ${picked  // solid, so the row's tint shows the same here
          ? '[background:linear-gradient(var(--color-selected),var(--color-selected)),var(--color-window)]'
          : 'bg-window group-hover:bg-hover'}`}>
          {j.cancellable && <RowMenu open={menu} setOpen={setMenu} onDetails={onOpen} onCancel={onCancel} />}
        </td>
      )}
    </tr>
  )
}

/** Running: a small bar and "1 h 12 min of 4 h". Waiting: "not started". Timed out: a full red bar. */
function TimeUsed({ job: j }: { job: Job }) {
  if (j.state === 'PENDING') return <span className="text-dim">not started</span>
  const share = j.state === 'TIMEOUT' ? 1 : j.limit_seconds ? j.seconds / j.limit_seconds : 0
  return (
    <span className="flex items-center gap-2" title={`${j.elapsed_text} of ${j.limit_text}`}>
      {j.limit_seconds > 0 && <Meter value={share} label="Time used" className="w-9 shrink-0" />}
      <span>{j.elapsed_text}</span>
      <span className="text-sm text-dim @max-[820px]:hidden">of {j.limit_text}</span>
    </span>
  )
}

/** ⋮ on a row, shown on hover or focus: details, and cancel (which asks first). */
function RowMenu({ open, setOpen, onDetails, onCancel }: {
  open: boolean; setOpen: (v: boolean) => void; onDetails: () => void; onCancel: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [open, setOpen])
  const pick = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); setOpen(false); fn() }
  return (
    <div ref={box} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button aria-label="Job actions" title="Job actions" aria-expanded={open} onClick={() => setOpen(!open)}
        className={`grid size-7 place-items-center rounded-md text-dim transition-opacity duration-90 hover:bg-selected
          hover:text-text focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100
          ${open ? 'opacity-100' : 'opacity-0'}`}><MoreVertical size={16} /></button>
      {open && (
        <div role="menu" className="menu-in absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-lg bg-raised py-1
          text-left shadow-[var(--shadow-menu)]">
          <button role="menuitem" onClick={pick(onDetails)}
            className="flex h-9 w-full items-center px-3 hover:bg-hover">Details</button>
          <button role="menuitem" onClick={pick(onCancel)}
            className="flex h-9 w-full items-center px-3 text-bad hover:bg-hover">
            Cancel job…</button>
        </div>
      )}
    </div>
  )
}

function Tick({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <input type="checkbox" aria-label={label} title={label} checked={checked} onChange={onChange}
    className="size-4 accent-[var(--color-accent)] align-middle" />
}
