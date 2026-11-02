// Storage: each quota as a row with a bar (yours solid inside the group's); a tap shows who uses it, where the
// cluster tells.
import { useState, type ReactNode } from 'react'

import { n, pct } from '@shared/components/usage/format'
import type { Storage, StorageRow } from '@shared/types/usage'
import { List } from '../../ui'
import { Bar } from './Bar'

function Quota({ r }: { r: StorageRow }) {
  const [open, setOpen] = useState(false)
  const people = Object.entries(r.people).sort((a, b) => b[1] - a[1])
  const yours = r.mine != null && r.label !== 'Home' ? `Yours ${n(r.mine)} GB` : ''
  const body = (
    <>
      <span className="flex w-full items-baseline gap-3">
        <span className="min-w-0 flex-1 break-words">{r.label}</span>
        <span className="text-right font-medium tabular-nums">
          {r.quota ? `${n(r.used)} of ${n(r.quota)} GB` : `${n(r.used)} GB`}</span>
      </span>
      {r.quota ? <Bar value={r.used / r.quota} mine={r.mine != null ? r.mine / r.quota : null} label={r.label}
        className="my-1 w-full" /> : null}
      <span className="flex w-full gap-3 text-sm text-dim tabular-nums">
        <span className="flex-1"><span className={r.quota && r.used / r.quota >= 0.9 ? 'text-bad' : ''}>
          {r.quota ? `${pct(r.used, r.quota)} full` : 'No limit'}</span>{yours && ` · ${yours}`}</span>
        {people.length > 0 && <span>{open ? 'Hide people' : 'People'}</span>}
      </span>
    </>
  )
  const cls = 'flex min-h-14 w-full flex-col gap-1 border-b border-line px-4 py-2.5 text-left'
  return (
    <>
      {people.length
        ? <button onClick={() => setOpen(!open)} className={`${cls} active:bg-pressed`}>{body}</button>
        : <div className={cls}>{body}</div>}
      {open && people.map(([user, gb]) => (
        <div key={user} className="flex min-h-12 items-center gap-3 border-b border-line pr-4 pl-8 text-sm">
          <span className="flex-1">{user}</span>
          <span className="tabular-nums">{n(gb, 1)} GB <span className="text-dim">· {pct(gb, r.used)}</span></span>
        </div>
      ))}
    </>
  )
}

export function StorageView({ storage, top }: { storage: Storage; top?: ReactNode }) {
  return (
    <>
      <List>{top}{storage.rows.map((r) => <Quota key={r.label} r={r} />)}</List>
      {storage.rows.some((r) => r.mine != null && r.label !== 'Home') &&
        <p className="px-4 pt-2 text-sm text-dim">The solid part of each bar is yours.</p>}
      {storage.raw && <pre className="m-4 overflow-x-auto rounded-lg bg-soft p-3 font-mono text-xs select-text">
        {storage.raw}</pre>}
      {!storage.rows.length && !storage.raw && <p className="px-4 py-3 text-dim">This cluster doesn't report storage
        limits.</p>}
    </>
  )
}
