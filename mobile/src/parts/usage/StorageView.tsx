// Storage: each quota with a bar (yours inside the group's); tap one to see who uses it, where the cluster tells.
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { n, pct } from '@shared/components/usage/format'
import { Bar } from '@shared/components/usage/parts'
import type { Storage, StorageRow } from '@shared/types/usage'

function Quota({ r }: { r: StorageRow }) {
  const [open, setOpen] = useState(false)
  const people = Object.entries(r.people).sort((a, b) => b[1] - a[1])
  const yours = r.mine != null && r.label !== 'Home' ? ` · yours ${n(r.mine)} GB` : ''
  const size = r.quota ? `${n(r.used)} of ${n(r.quota)} GB (${pct(r.used, r.quota)})` : `${n(r.used)} GB, no quota`
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{r.label}</span>
        {people.length > 0 && (open ? <ChevronDown size={18} className="text-dim" />
          : <ChevronRight size={18} className="text-dim" />)}
      </div>
      <p className="truncate text-sm text-dim tabular-nums">{size}{yours}</p>
      <Bar value={r.quota ? r.used / r.quota : 0} mine={r.quota && r.mine != null ? r.mine / r.quota : null}
        className="mt-2 w-full" />
    </>
  )
  return (
    <div className="border-b border-line last:border-0">
      {people.length
        ? <button onClick={() => setOpen(!open)} className="block w-full px-4 py-3 text-left active:bg-hover">{body}</button>
        : <div className="px-4 py-3">{body}</div>}
      {open && people.map(([user, gb]) => (
        <div key={user} className="flex min-h-11 items-center border-t border-line pr-4 pl-8 text-sm">
          <span className="flex-1">{user}</span>
          <span className="tabular-nums">{n(gb, 1)} GB · <span className="text-dim">{pct(gb, r.used)}</span></span>
        </div>
      ))}
    </div>
  )
}

export function StorageView({ storage }: { storage: Storage }) {
  return (
    <div className="flex flex-col gap-3">
      {storage.rows.length > 0 && <section className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
        {storage.rows.map((r) => <Quota key={r.label} r={r} />)}</section>}
      {storage.rows.some((r) => r.mine != null) && <p className="text-sm text-dim">The darker part of each bar is yours.</p>}
      {storage.raw && <pre className="overflow-x-auto rounded-xl bg-pill p-3 font-mono text-xs select-text">
        {storage.raw}</pre>}
      {!storage.rows.length && !storage.raw && <p className="text-dim">This cluster doesn't report storage quotas.</p>}
    </div>
  )
}
