import { GitCompareArrows, MoreHorizontal, Search, StickyNote } from 'lucide-react'
import { useState } from 'react'

import type { GitState, SavedSetting } from '../../../../types/history'
import { SavedSettings } from '../versions/SavedSettings'

type Props = {
  state: GitState
  query: string
  onQuery: (q: string) => void
  onCompare: () => void
  notesOpen: boolean
  openNotes: number
  onNotes: () => void
  onSetting: (mode: SavedSetting) => void
}

export function ListToolbar({ state, query, onQuery, onCompare, notesOpen, openNotes, onNotes, onSetting }: Props) {
  const [settings, setSettings] = useState(false)
  return (
    <div className="relative flex shrink-0 items-center gap-2 p-2.5">
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-pill px-2.5">
        <Search size={15} className="text-dim" />
        <input value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Search commits"
          aria-label="Search commits" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" />
      </label>
      <button onClick={onCompare}
        className="flex h-9 items-center gap-1.5 rounded-lg bg-pill px-3 text-sm font-semibold hover:bg-pressed">
        <GitCompareArrows size={15} /> Compare</button>
      <button onClick={onNotes} aria-pressed={notesOpen} title="Notes: comments and to-dos"
        className={`relative grid size-9 shrink-0 place-items-center rounded-lg ${notesOpen ? 'bg-selected'
          : 'bg-pill hover:bg-pressed'}`}>
        <StickyNote size={16} />
        {openNotes > 0 && <span className="note-pin absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center
          rounded-full px-1 text-[10px] font-semibold">{openNotes}</span>}</button>
      <button onClick={() => setSettings(!settings)} aria-label="Saved versions" title="Saved versions"
        className={`grid size-9 place-items-center rounded-lg ${settings ? 'bg-selected' : 'bg-pill hover:bg-pressed'}`}>
        <MoreHorizontal size={16} /></button>
      {settings && <SavedSettings value={state.saved} user={state.login} branch={state.branch}
        onPick={onSetting} onClose={() => setSettings(false)} />}
    </div>
  )
}
