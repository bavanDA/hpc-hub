import { ArchiveRestore, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { StorageRow } from '../../types/usage'
import { banner } from '../backup/copy'
import { Bar } from './Bar'
import { n, pct } from './format'
import { purgeDays } from './summary'

export function QuotaRow({ r, onBackup }: { r: StorageRow; onBackup?: () => void }) {
  const [open, setOpen] = useState(false)
  const people = Object.entries(r.people).sort((a, b) => b[1] - a[1])
  const yours = r.mine != null && r.label !== 'Home' ? ` · yours ${n(r.mine)} GB` : ''
  const size = r.quota ? `${n(r.used)} of ${n(r.quota)} GB (${pct(r.used, r.quota)})` : `${n(r.used)} GB, no quota`
  const purge = purgeDays(r)
  return (
    <div>
      <div onClick={() => people.length && setOpen(!open)}
        className={`flex min-h-[56px] items-center gap-3 px-4 py-2 ${people.length ? 'hover:bg-hover' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className="truncate">{r.label}</div>
          <div className="truncate text-sm text-dim">{size}{yours}</div>
          {onBackup && purge !== 0 && (
            <div className="flex flex-wrap items-center gap-x-2 text-sm text-dim">
              {purge > 0 && <span>{banner.usage(purge)}</span>}
              <button onClick={(e) => { e.stopPropagation(); onBackup() }}
                className="inline-flex items-center gap-1 font-semibold text-text underline">
                <ArchiveRestore size={14} />{banner.usageLink}</button>
            </div>
          )}
        </div>
        <Bar value={r.quota ? r.used / r.quota : 0} mine={r.quota && r.mine != null ? r.mine / r.quota : null} />
        <span className="w-4 shrink-0 text-dim">
          {people.length > 0 && (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}</span>
      </div>
      {open && people.map(([user, gb]) => (
        <div key={user} className="flex h-11 items-center border-t border-line pr-11 pl-8 text-base">
          <span className="flex-1">{user}</span>
          <span className="tabular-nums">{n(gb, 1)} GB · <span className="text-dim">{pct(gb, r.used)}</span></span>
        </div>
      ))}
    </div>
  )
}
