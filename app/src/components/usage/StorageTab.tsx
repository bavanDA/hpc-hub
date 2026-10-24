// Storage: each quota with a bar (yours inside the group's), and who uses it where the cluster tells.
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { Storage, StorageRow } from '../../types/usage'
import { List } from '../ui'
import { n, pct } from './format'
import { Bar, Section } from './parts'

function Quota({ r }: { r: StorageRow }) {
  const [open, setOpen] = useState(false)
  const people = Object.entries(r.people).sort((a, b) => b[1] - a[1])
  const yours = r.mine != null && r.label !== 'Home' ? ` · yours ${n(r.mine)} GB` : ''
  const size = r.quota ? `${n(r.used)} of ${n(r.quota)} GB (${pct(r.used, r.quota)})` : `${n(r.used)} GB, no quota`
  return (
    <div>
      <div onClick={() => people.length && setOpen(!open)}
        className={`flex min-h-[56px] items-center gap-3 px-4 py-2 ${people.length ? 'hover:bg-hover' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className="truncate">{r.label}</div>
          <div className="truncate text-[13px] text-dim">{size}{yours}</div>
        </div>
        <Bar value={r.quota ? r.used / r.quota : 0} mine={r.quota && r.mine != null ? r.mine / r.quota : null} />
        <span className="w-4 text-dim">
          {people.length > 0 && (open ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}</span>
      </div>
      {open && people.map(([user, gb]) => (
        <div key={user} className="flex h-11 items-center border-t border-line pr-11 pl-8 text-[14px]">
          <span className="flex-1">{user}</span>
          <span className="tabular-nums">{n(gb, 1)} GB · <span className="text-dim">{pct(gb, r.used)}</span></span>
        </div>
      ))}
    </div>
  )
}

export function StorageTab({ storage, error }: { storage: Storage | null; error: string }) {
  const note = error ? `Could not load: ${error}` : !storage ? 'Loading…'
    : storage.rows.some((r) => r.mine != null) ? 'The darker part of each bar is yours.' : ''
  return (
    <Section title="Storage" note={note}>
      {storage && storage.rows.length > 0 && <List>{storage.rows.map((r) => <Quota key={r.label} r={r} />)}</List>}
      {storage?.raw && <pre className="overflow-auto rounded-xl bg-view p-4 font-mono text-[13px] select-text">
        {storage.raw}</pre>}
    </Section>
  )
}
