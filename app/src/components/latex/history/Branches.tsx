// The bar under the commit list: the branch you are on with its menu (find, your branches, branches only on origin,
// New branch from here, Compare with a branch, Get the latest), what is happening, and Push. Switching asks about
// changes not committed yet first, then shows its steps while editing waits.
import { Check, ChevronsUpDown, CircleCheck, Cloud, GitBranch, GitBranchPlus, GitCompareArrows, Loader2, RefreshCw,
  Search, ArrowUp, CircleAlert } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import type { GitState, Refs, Step, SwitchCheck } from '../../../types/history'
import { Button, Dialog, FIELD, Spinner } from '../../ui'
import { clock, git, plural, shortHash, when, type Where } from './bits'

export type Busy = { label: string } | null

type BarProps = {
  where: Where
  state: GitState
  busy: Busy
  start: string  // the commit New branch starts from (the one selected, or HEAD)
  onSwitch: (target: string) => void
  onNewBranch: (name: string, start: string) => void
  onCompareBranch: (name: string) => void
  onLatest: () => void
  onPush: () => void
  extra?: ReactNode  // the right side of the bar (later: the agent choice)
}

export function BranchBar({ where, state, busy, start, onSwitch, onNewBranch, onCompareBranch, onLatest, onPush,
  extra }: BarProps) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [open])
  const status = busy ? <><Loader2 size={13} className="animate-spin" /> {busy.label}</>
    : !state.upstream ? (state.remotes.length ? 'Not on origin yet' : 'No remote')
    : state.ahead && state.behind ? `${state.ahead} to push, ${state.behind} new${extra ? '' : ' on origin'}`
    : state.ahead ? (extra ? `${state.ahead} to push` : `${plural(state.ahead, 'commit')} to push`)
    : state.behind ? `${state.behind} new${extra ? '' : ' on origin'}` : extra ? 'Up to date' : 'Up to date with origin'
  return (
    <div ref={box} className="relative flex h-11 shrink-0 items-center gap-2 border-t border-line pr-2 pl-2 text-sm">
      <button onClick={() => setOpen(!open)} disabled={!!busy} title="Switch branch"
        className={`flex h-8 items-center gap-1.5 rounded-md px-2 font-semibold ${open ? 'bg-selected' : 'hover:bg-hover'}`}>
        <GitBranch size={14} /> <span className="max-w-[120px] truncate">{state.branch || 'no branch'}</span>
        <ChevronsUpDown size={13} className="text-dim" /></button>
      <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-dim">{status}</span>
      {extra}
      {!busy && state.ahead > 0 && <button onClick={onPush} title="Pull first, then push"
        className="flex h-8 items-center gap-1 rounded-md px-2 font-semibold hover:bg-hover"><ArrowUp size={14} /> Push</button>}
      {!busy && !state.ahead && state.fetched > 0 && !extra && <span className="shrink-0 text-xs text-dim">Pulled {clock(state.fetched)}</span>}
      {open && <BranchMenu where={where} state={state} start={start} onClose={() => setOpen(false)}
        onSwitch={(b) => { setOpen(false); onSwitch(b) }} onNew={(n) => { setOpen(false); onNewBranch(n, start) }}
        onCompare={(b) => { setOpen(false); onCompareBranch(b) }} onLatest={() => { setOpen(false); onLatest() }} />}
    </div>
  )
}

function BranchMenu({ where, state, start, onSwitch, onNew, onCompare, onLatest }:
  { where: Where; state: GitState; start: string; onClose: () => void; onSwitch: (b: string) => void
    onNew: (name: string) => void; onCompare: (b: string) => void; onLatest: () => void }) {
  const [refs, setRefs] = useState<Refs | null>(null)
  const [error, setError] = useState('')
  const [find, setFind] = useState('')
  const [mode, setMode] = useState<'switch' | 'new' | 'compare'>('switch')
  const [name, setName] = useState('')
  useEffect(() => {
    git<Refs>('refs', where).then(setRefs).catch((e: Error) => setError(e.message))
  }, [where])
  const q = find.trim().toLowerCase()
  const mine = (refs?.branches ?? []).filter((b) => !q || b.name.toLowerCase().includes(q))
  const only = (refs?.remote_only ?? []).filter((b) => !q || b.name.toLowerCase().includes(q))
  const head = (t: string) => <div className="px-2.5 pt-2 pb-1 text-xs font-semibold text-dim">{t}</div>
  const row = (key: string, icon: ReactNode, label: string, hint: ReactNode, act: () => void, current = false) => (
    <button key={key} onClick={act} disabled={current && mode === 'switch'}
      className="flex h-8 w-full items-center gap-2.5 rounded-md px-2.5 text-left hover:bg-hover disabled:hover:bg-transparent">
      <span className="text-dim">{icon}</span>
      <span className={`min-w-0 flex-1 truncate ${current ? 'font-semibold' : ''}`}>{label}</span>
      <span className="shrink-0 text-xs text-dim">{hint}</span>
    </button>
  )
  return (
    <div className="menu-in absolute bottom-full left-1.5 z-30 mb-1 flex max-h-[70vh] w-[380px] flex-col rounded-xl
      border border-line bg-raised p-1.5 shadow-xl">
      {mode === 'new' ? (
        <form className="flex flex-col gap-2 p-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) onNew(name.trim()) }}>
          <div className="font-semibold">New branch from <span className="font-mono text-sm">{shortHash(start)}</span></div>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="reviewer-2-response"
            className={FIELD} aria-label="Branch name" />
          <p className="text-xs text-dim">You switch to it right away. Your changes not committed yet come along.</p>
          <div className="flex justify-end gap-2">
            <Button size="sm" type="button" onClick={() => setMode('switch')}>Back</Button>
            <Button size="sm" kind="primary" disabled={!name.trim()}>Create and switch</Button>
          </div>
        </form>
      ) : <>
        <label className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-pill px-2.5">
          <Search size={14} className="text-dim" />
          <input autoFocus value={find} onChange={(e) => setFind(e.target.value)} aria-label="Find a branch"
            placeholder={mode === 'compare' ? 'Compare with which branch?' : 'Find a branch'}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {error && <p className="p-3 text-sm text-bad">{error}</p>}
          {!refs && !error && <div className="grid h-20 place-items-center"><Spinner /></div>}
          {refs && <>
            {head('Branches')}
            {mine.map((b) => row(b.name, b.current ? <Check size={14} /> : <GitBranch size={14} />, b.name,
              b.current ? 'Current' : <>{b.new > 0 && <span className="mr-1.5">{b.new} new</span>}{b.author} · {when(b.time)}</>,
              () => (mode === 'compare' ? onCompare(b.name) : onSwitch(b.name)), b.current))}
            {only.length > 0 && head('On origin only')}
            {only.map((b) => row(b.name, <Cloud size={14} />, b.local, <>{b.author} · {when(b.time)}</>,
              () => (mode === 'compare' ? onCompare(b.name) : onSwitch(b.name))))}
            {!mine.length && !only.length && <p className="px-2.5 py-2 text-sm text-dim">No branch matches.</p>}
          </>}
        </div>
        {mode === 'switch' && <div className="mt-1 shrink-0 border-t border-line pt-1">
          {row('new', <GitBranchPlus size={14} />, 'New branch from here', <span className="font-mono">{shortHash(start)}</span>,
            () => setMode('new'))}
          {row('cmp', <GitCompareArrows size={14} />, 'Compare with a branch', '', () => setMode('compare'))}
          {row('latest', <RefreshCw size={14} />, 'Get the latest from origin',
            state.fetched ? `last ${clock(state.fetched)}` : '', onLatest)}
        </div>}
      </>}
    </div>
  )
}

/** F1: what happens to changes not committed yet when you switch. */
export function SwitchDialog({ check, clusterName, onClose, onSwitch, onCommitFirst }:
  { check: SwitchCheck; clusterName: string; onClose: () => void; onSwitch: (mode: 'bring' | 'keep') => void
    onCommitFirst: () => void }) {
  const [pick, setPick] = useState<'bring' | 'keep' | 'commit'>(check.bring ? 'bring' : 'keep')
  const from = check.from || 'this branch'
  const clash = check.clash[0]
  const option = (v: typeof pick, title: string, text: ReactNode, disabled = false) => (
    <button onClick={() => setPick(v)} disabled={disabled} role="radio" aria-checked={pick === v}
      className={`flex w-full gap-3 rounded-xl border p-4 text-left disabled:opacity-50 ${pick === v
        ? 'border-text ring-1 ring-text' : 'border-line-strong hover:bg-hover'}`}>
      <span className={`mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-full border-2 ${pick === v
        ? 'border-text' : 'border-line-strong'}`}>{pick === v && <span className="size-2 rounded-full bg-text" />}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block text-sm text-dim">{text}</span>
      </span>
    </button>
  )
  return (
    <Dialog title={`Switch to ${check.target}`} onClose={onClose} width={540} actions={<>
      <span className="mr-auto max-w-[260px] text-xs text-dim">Git runs over your connection to {clusterName}. No
        compute node needed.</span>
      <Button onClick={onClose}>Cancel</Button>
      <Button kind="primary" onClick={() => pick === 'commit' ? onCommitFirst() : onSwitch(pick)}>
        {pick === 'commit' ? 'Commit first' : 'Switch'}</Button>
    </>}>
      <p className="text-dim">You have changes not committed yet on <b className="text-text">{from}</b>. What should
        happen to them?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {check.changes.slice(0, 6).map((c) => (
          <span key={c.path} className="rounded-md bg-pill px-2 py-0.5 font-mono text-xs">{c.path.split('/').pop()}
            {c.new ? <span className="diff-add-ink ml-1">new</span> : <span className="diff-add-ink ml-1">+{c.added}</span>}</span>
        ))}
        {check.changes.length > 6 && <span className="text-xs text-dim">and {check.changes.length - 6} more</span>}
      </div>
      <div role="radiogroup" className="mt-4 flex flex-col gap-2.5">
        {option('bring', 'Bring them along', <>Keep working on them on {check.target}.
          <span className={`mt-1.5 flex items-center gap-1.5 ${check.bring ? 'diff-add-ink' : 'text-bad'}`}>
            {check.bring ? <><CircleCheck size={14} /> Checked: they do not touch anything that differs on that
              branch.</> : <><CircleAlert size={14} /> They clash with {check.target} in {clash.path}
              {clash.line ? `, line ${clash.line}` : ''}.</>}</span></>, !check.bring)}
        {option('keep', `Keep them on ${from}`, <>Put aside with {from}. They come back by themselves when you switch
          back to {from}.</>)}
        {option('commit', `Commit them on ${from} first`, 'Opens the commit box. The switch happens after you commit.')}
      </div>
    </Dialog>
  )
}

/** G1 and P1's steps: done, running, still to come. */
export function Steps({ steps, todo = [], stopped }: { steps: Step[]; todo?: string[]; stopped?: string }) {
  return (
    <ol className="flex flex-col gap-1.5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-3">
          {s.done ? <CircleCheck size={18} className="shrink-0 fill-text text-window" />
            : <Loader2 size={18} className="shrink-0 animate-spin text-dim" />}
          <span className={`min-w-0 flex-1 ${!s.done ? 'font-semibold' : ''}`}>{s.label}</span>
          {s.done && <span className="w-14 shrink-0 text-right text-sm tabular-nums text-dim">{s.seconds} s</span>}
        </li>
      ))}
      {stopped && <li className="flex items-center gap-3 font-semibold">
        <CircleAlert size={18} className="shrink-0 fill-orange text-window" /> {stopped}</li>}
      {todo.map((t) => (
        <li key={t} className="flex items-center gap-3 text-faint">
          <span className="size-[18px] shrink-0 rounded-full border-2 border-line-strong" /> {t}</li>
      ))}
    </ol>
  )
}

/** G1: the switch's card, over the history while it runs. */
export function SwitchingCard({ target, steps, expected, brought, seconds }:
  { target: string; steps: Step[]; expected: string[]; brought: number; seconds: number }) {
  return (
    <div className="dialog-in absolute top-28 left-1/2 z-20 w-[460px] max-w-[90%] -translate-x-1/2 rounded-xl border
      border-line bg-raised p-5 shadow-[var(--shadow-dialog)]">
      <div className="flex items-center gap-2.5">
        <Loader2 size={18} className="animate-spin" />
        <span className="flex-1 font-semibold">Switching to {target}</span>
        <span className="text-sm tabular-nums text-dim">{seconds} s</span>
      </div>
      {brought > 0 && <p className="mt-1 pl-7 text-sm text-dim">Your {plural(brought, 'change')} come along.</p>}
      <div className="mt-4"><Steps steps={steps} todo={expected.slice(steps.length)} /></div>
      <p className="mt-4 border-t border-line pt-3 text-xs text-dim">Editing is paused until the files are in place,
        so nothing is lost. You can keep reading the PDF.</p>
    </div>
  )
}
