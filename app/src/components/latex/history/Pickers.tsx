// D1's From and To pickers with quick picks (a tag, the last pull, my last commit, origin/main, a date), and S1's
// saved-versions setting.
import { ArrowDown, Calendar, Check, ChevronDown, GitBranch, GitCommitHorizontal, MousePointerClick, Pencil, Tag, User,
  X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { HCommit, Refs, SavedSetting } from '../../../types/history'
import { shortHash, when } from './bits'

function useOutside(open: boolean, close: () => void) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [open, close])
  return box
}

/** A version's name as people know it: Now, a tag, or the commit's short hash and subject. */
export function versionLabel(v: string, commits: HCommit[], refs: Refs | null): { icon: ReactNode; name: string; hint: string } {
  if (v === '') return { icon: <Pencil size={13} />, name: 'Now', hint: 'with changes not committed yet' }
  const c = commits.find((x) => x.hash === v || x.short === v)
  const tag = refs?.tags.find((t) => t.hash === c?.hash || t.name === v) ?? (c?.tags[0] ? { name: c.tags[0] } : null)
  if (tag) return { icon: <Tag size={13} />, name: tag.name, hint: c ? when(c.time) : '' }
  return { icon: <GitCommitHorizontal size={13} />, name: c ? shortHash(c.hash) : shortHash(v),
    hint: c?.subject ?? '' }
}

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

export function SavedSettings({ value, user, branch, onPick, onClose }:
  { value: SavedSetting; user: string; branch: string; onPick: (v: SavedSetting) => void; onClose: () => void }) {
  const box = useOutside(true, onClose)
  const option = (v: SavedSetting, title: ReactNode, text?: ReactNode) => (
    <button onClick={() => onPick(v)} role="radio" aria-checked={value === v}
      className={`flex w-full gap-3 rounded-xl border p-3.5 text-left ${value === v ? 'border-text ring-1 ring-text'
        : 'border-line-strong hover:bg-hover'}`}>
      <span className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2 ${value === v
        ? 'border-text' : 'border-line-strong'}`}>{value === v && <span className="size-2 rounded-full bg-text" />}</span>
      <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span>
        {text && <span className="mt-0.5 block text-sm text-dim">{text}</span>}</span>
    </button>
  )
  return (
    <div ref={box} className="menu-in absolute top-full left-0 z-30 mt-1.5 w-[400px] rounded-xl border border-line bg-raised
      p-4 shadow-xl">
      <div className="flex items-center"><h3 className="flex-1 font-semibold">Saved versions</h3>
        <button onClick={onClose} aria-label="Close" className="grid size-7 place-items-center rounded-md text-dim
          hover:bg-hover"><X size={15} /></button></div>
      <p className="mt-1 text-sm text-dim">HPC Hub keeps a version on every save and compile, at most every 5 minutes.
        They stay out of your commits and are never part of a normal push.</p>
      <div role="radiogroup" className="mt-3 flex flex-col gap-2">
        {option('off', 'Off')}
        {option('cluster', <>Keep on the cluster <span className="font-normal text-dim">default</span></>,
          'In this repository on the cluster, next to your branches but not one of them.')}
        {option('backup', 'Also push to a backup branch', <>Sent to origin as <span className="font-mono">
          saved/{user || 'you'}/{branch || 'main'}</span>. Co-authors can see that branch.</>)}
      </div>
      <div className="mt-3 flex items-center text-sm"><span className="flex-1">Clear versions older than</span>
        <span className="rounded-md bg-pill px-2.5 py-1">30 days</span></div>
    </div>
  )
}
