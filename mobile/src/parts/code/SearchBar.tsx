// Find, and replace, in the open file: "3 of 12", next and previous, and a Replace row that opens on request.
// It drives CodeMirror's own search (search.ts), so every match lights up in the editor while the bar is open.
import { ChevronDown, ChevronUp, Replace, X } from 'lucide-react'
import { useEffect, useState, type RefObject } from 'react'

import type { EditorHandle } from '@shared/components/code/Editor'
import { closeFind, countFind, countText, findNextMatch, findPreviousMatch, replaceEvery, replaceOne,
  setFind } from '@shared/components/code/search'

type Props = { editor: RefObject<EditorHandle | null>; canReplace: boolean; tick: number; onClose: () => void
  onReplaced: (n: number) => void }

const ICON = 'grid size-12 shrink-0 place-items-center rounded-full active:bg-pressed disabled:opacity-40'
const INPUT = 'h-12 min-w-0 flex-1 rounded-[10px] bg-soft px-3 text-base outline-none focus:ring-2 focus:ring-accent'

export function SearchBar({ editor, canReplace, tick, onClose, onReplaced }: Props) {
  const [text, setText] = useState('')
  const [replace, setReplace] = useState('')
  const [replacing, setReplacing] = useState(false)
  const [count, setCount] = useState('')

  const view = () => editor.current?.view() ?? null
  const recount = () => { const v = view(); setCount(v && text ? countText(countFind(v)) : '') }

  useEffect(() => {
    const v = view()
    if (v) setFind(v, { text, replace })
    recount()
  }, [text, replace])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(recount, [tick])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { const v = view(); if (v) closeFind(v) }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const step = (fn: (v: NonNullable<ReturnType<typeof view>>) => unknown) => {
    const v = view()
    if (!v || !text) return
    fn(v)
    recount()
  }

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-line bg-window px-2 py-2">
      <div className="flex items-center gap-1">
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Find in file"
          aria-label="Find in file" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={INPUT}
          onKeyDown={(e) => { if (e.key === 'Enter') step(e.shiftKey ? findPreviousMatch : findNextMatch) }} />
        <span className="shrink-0 px-1 text-center text-xs whitespace-nowrap text-dim" aria-live="polite">{count}</span>
        <button aria-label="Previous match" className={ICON} disabled={!text} onClick={() => step(findPreviousMatch)}>
          <ChevronUp size={20} /></button>
        <button aria-label="Next match" className={ICON} disabled={!text} onClick={() => step(findNextMatch)}>
          <ChevronDown size={20} /></button>
        {canReplace && (
          <button aria-label="Replace" aria-pressed={replacing} onClick={() => setReplacing((r) => !r)}
            className={`${ICON} ${replacing ? 'bg-accent text-on-accent' : ''}`}><Replace size={18} /></button>
        )}
        <button aria-label="Close search" className={ICON} onClick={onClose}><X size={20} /></button>
      </div>
      {replacing && (
        <div className="flex items-center gap-2">
          <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with"
            aria-label="Replace with" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={INPUT} />
          <button disabled={!text} onClick={() => step(replaceOne)}
            className="h-12 shrink-0 rounded-[10px] border border-line-strong px-3 font-semibold active:bg-pressed
              disabled:opacity-40">
            Replace</button>
          <button disabled={!text} onClick={() => step((v) => onReplaced(replaceEvery(v)))}
            className="h-12 shrink-0 rounded-[10px] border border-line-strong px-3 font-semibold active:bg-pressed
              disabled:opacity-40">
            All</button>
        </div>
      )}
    </div>
  )
}
