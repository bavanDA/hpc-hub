import { Check, Cloud, GitBranch, GitBranchPlus, GitCompareArrows, RefreshCw, Search } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

import type { GitState, Refs } from '../../../../types/history'
import { Button } from '../../../ui/Button'
import { FIELD } from '../../../ui/field'
import { Spinner } from '../../../ui/Spinner'
import { clock, shortHash, when } from '../format'
import { git, type Where } from '../git'

export function BranchMenu({ where, state, start, onSwitch, onNew, onCompare, onLatest }:
  { where: Where; state: GitState; start: string; onSwitch: (b: string) => void
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
