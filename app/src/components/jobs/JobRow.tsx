import { useState } from 'react'

import type { Job } from '../../types/jobs'
import { StatusPill } from '../ui/StatusPill'
import { type Column, NUMBERS } from './columns'
import { memText, reasonText, stateName } from './format'
import { RowMenu } from './RowMenu'
import { Tick } from './Tick'
import { TimeUsed } from './TimeUsed'

export function JobRow({ job: j, cols, anyCancel, picked, onPick, onOpen, onCancel }: {
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
