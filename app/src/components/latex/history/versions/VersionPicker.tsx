import { ArrowDown, Calendar, Check, ChevronDown, GitBranch, MousePointerClick, Pencil, Tag, User, X } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import type { HCommit, Refs } from '../../../../types/history'
import { useOutside } from '../../useOutside'
import { when } from '../format'
import { versionLabel } from './versionLabel'

export function VersionPicker({ value, commits, refs, head, allowNow, onPick, onPickInList }:
  { value: string; commits: HCommit[]; refs: Refs | null; head: string; allowNow: boolean
    onPick: (v: string) => void; onPickInList: () => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState(false)
  const box = useOutside(open, () => { setOpen(false); setDate(false) })
  const label = versionLabel(value, commits, refs)
  const pick = (v: string) => { setOpen(false); setDate(false); onPick(v) }
  const upstream = refs?.branches.find((b) => b.current)?.upstream
  const origin = upstream ? refs?.remote.find((r) => r.name === upstream) : null
  const item = (key: string, icon: ReactNode, name: string, hint: string, v: string | null, act?: () => void) => (
    <button key={key} onClick={() => act ? act() : v !== null && pick(v)} disabled={v === null && !act}
      className="flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left hover:bg-hover disabled:opacity-45">
      <span className="text-dim">{icon}</span><span className="min-w-0 flex-1 truncate">{name}</span>
      <span className="shrink-0 text-xs text-dim">{hint}</span>
      {v !== null && v === value && <Check size={14} />}
    </button>
  )
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)}
        className={`flex h-9 max-w-[250px] items-center gap-2 rounded-lg border border-line-strong px-3 text-sm
          ${open ? 'bg-selected' : 'hover:bg-hover'}`}>
        {label.icon}<span className="font-semibold">{label.name}</span>
        <span className="min-w-0 truncate text-dim">{label.hint}</span><ChevronDown size={14} className="shrink-0 text-dim" />
      </button>
      {open && (
        <div className="menu-in absolute top-full left-0 z-30 mt-1.5 w-[330px] rounded-xl border border-line bg-raised p-1.5
          shadow-xl">
          <div className="px-2.5 pt-1.5 pb-1 text-xs font-semibold text-dim">Quick picks</div>
          {allowNow && item('now', <Pencil size={14} />, 'Now', 'with changes not committed yet', '')}
          {(refs?.tags ?? []).slice(0, 4).map((t) => item(`t${t.name}`, <Tag size={14} />, t.name, when(t.time), t.hash))}
          {item('pull', <ArrowDown size={14} />, 'Last pull', refs?.last_pull ? `${when(refs.last_pull.time, true)}` : 'none yet',
            refs?.last_pull?.hash ?? null)}
          {item('mine', <User size={14} />, 'My last commit', refs?.mine ? when(refs.mine.time) : 'none yet',
            refs?.mine?.hash ?? null)}
          {origin && item('origin', <GitBranch size={14} />, origin.name, origin.hash === head ? 'same as yours'
            : when(origin.time), origin.hash)}
          <div className="my-1 border-t border-line" />
          {item('list', <MousePointerClick size={14} />, 'Pick a commit in the list', '', null,
            () => { setOpen(false); onPickInList() })}
          {date ? (
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              <Calendar size={14} className="text-dim" />
              <input type="date" autoFocus aria-label="Date" onChange={(e) => {
                const t = new Date(`${e.target.value}T23:59:59`).getTime() / 1000
                const c = commits.find((x) => x.time <= t)
                if (c) pick(c.hash)
              }} className="h-8 flex-1 rounded-md border border-line-strong bg-window px-2 text-sm" />
              <button onClick={() => setDate(false)} aria-label="Close" className="text-dim"><X size={14} /></button>
            </div>
          ) : item('date', <Calendar size={14} />, 'Pick a date', 'the last commit that day', null, () => setDate(true))}
          <p className="px-2.5 pt-1.5 pb-1 text-xs text-dim">Tip: in the list, Shift-click a second commit to compare
            the two.</p>
        </div>
      )}
    </div>
  )
}
