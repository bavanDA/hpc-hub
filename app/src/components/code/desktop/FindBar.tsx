import type { EditorView } from '@codemirror/view'
import { CaseSensitive, ChevronDown, ChevronUp, Regex, Replace, WholeWord, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { IconButton } from '../../ui'
import { closeFind, countFind, countText, findNextMatch, findPreviousMatch, replaceEvery, replaceOne, setFind } from '../search'

/** Find and replace in the open file, above the editor. */
export function FindBar({ view, editable, start, onClose }: {
  view: () => EditorView | null
  editable: boolean
  start: string                    // the selected word, to search for right away
  onClose: () => void
}) {
  const [text, setText] = useState(start)
  const [replace, setReplace] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [caseSensitive, setCase] = useState(false)
  const [wholeWord, setWhole] = useState(false)
  const [regexp, setRegexp] = useState(false)
  const [count, setCount] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => { input.current?.select() }, [])
  useEffect(() => {
    const v = view()
    if (!v) return
    setFind(v, { text, replace, caseSensitive, wholeWord, regexp })
    setCount(text ? countText(countFind(v)) : '')
  }, [text, replace, caseSensitive, wholeWord, regexp, view])

  const close = () => {
    const v = view()
    if (v) closeFind(v)
    onClose()
  }
  const step = (back = false) => {
    const v = view()
    if (!v || !text) return
    if (back) findPreviousMatch(v); else findNextMatch(v)
    setCount(countText(countFind(v)))
  }
  const one = () => {
    const v = view()
    if (v) { replaceOne(v); setCount(countText(countFind(v))) }
  }
  const all = () => {
    const v = view()
    if (v) { replaceEvery(v); setCount(countText(countFind(v))) }
  }
  const toggle = (on: boolean) => `grid size-7 place-items-center rounded-md ${on ? 'bg-accent text-on-accent'
    : 'text-dim hover:bg-hover hover:text-text'}`
  const field = 'h-7 min-w-0 flex-1 rounded-md border border-line-strong bg-window px-2 text-sm text-text outline-none ' +
    'placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent'

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-line bg-window px-3 py-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); close() }
        if (e.key === 'Enter' && e.target === input.current) { e.preventDefault(); step(e.shiftKey) }
      }}>
      <div className="flex items-center gap-1.5">
        {editable && <IconButton icon={Replace} label="Replace" small onClick={() => setShowReplace(!showReplace)} />}
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Find"
          aria-label="Find" className={field} />
        <span className="w-28 shrink-0 text-xs text-dim tnum">{count}</span>
        <button type="button" title="Match case" aria-pressed={caseSensitive} className={toggle(caseSensitive)}
          onClick={() => setCase(!caseSensitive)}><CaseSensitive size={16} /></button>
        <button type="button" title="Whole word" aria-pressed={wholeWord} className={toggle(wholeWord)}
          onClick={() => setWhole(!wholeWord)}><WholeWord size={16} /></button>
        <button type="button" title="Pattern (regular expression)" aria-pressed={regexp} className={toggle(regexp)}
          onClick={() => setRegexp(!regexp)}><Regex size={16} /></button>
        <IconButton icon={ChevronUp} label="Previous match" small onClick={() => step(true)} />
        <IconButton icon={ChevronDown} label="Next match" small onClick={() => step()} />
        <IconButton icon={X} label="Close find" small onClick={close} />
      </div>
      {editable && showReplace && (
        <div className="flex items-center gap-1.5 pl-[34px]">
          <input value={replace} onChange={(e) => setReplace(e.target.value)} placeholder="Replace with"
            aria-label="Replace with" className={field} />
          <button type="button" onClick={one} disabled={!text}
            className="h-7 rounded-md border border-line-strong px-3 text-sm font-semibold hover:bg-hover disabled:opacity-45">
            Replace</button>
          <button type="button" onClick={all} disabled={!text}
            className="h-7 rounded-md border border-line-strong px-3 text-sm font-semibold hover:bg-hover disabled:opacity-45">
            All</button>
        </div>
      )}
    </div>
  )
}
