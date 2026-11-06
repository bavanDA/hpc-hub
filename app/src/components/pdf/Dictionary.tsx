import { Play, Volume2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Spinner } from '../ui'
import { hear } from './dictionary'
import type { WordPick } from './index'
import { Meanings } from './Meanings'
import { useEntry } from './useEntry'
import type { Reader } from './reader'

export function Dictionary({ pick, reader, overlay, onRead, onClose }:
  { pick: WordPick; reader: Reader; overlay: boolean; onRead: () => void; onClose: () => void }) {
  const entry = useEntry(pick.text)
  const [saying, setSaying] = useState('')
  const say = () => {
    setSaying('…')
    hear(entry?.word || pick.text, reader.getSnapshot().voice).then(() => setSaying(''))
      .catch((e: Error) => setSaying(e.message))
  }
  const sound = [entry?.respelling, entry?.phonetic].filter(Boolean)
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    window.addEventListener('keydown', key, true)  // before the PDF window's own Escape
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])
  return (
    <aside aria-label="Dictionary" className={`flex w-[320px] shrink-0 flex-col border-l border-line bg-window ${
      overlay ? 'absolute inset-y-0 right-0 z-20 shadow-[var(--shadow-menu)]' : ''}`}>
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-1.5 pl-5">
        <span className="flex-1 text-xs font-semibold tracking-wide text-dim uppercase">Dictionary</span>
        <button aria-label="Close dictionary" title="Close" onClick={onClose}
          className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover active:bg-pressed">
          <X size={16} /></button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pt-4 pb-4">
          <h2 className="text-2xl font-semibold break-words">{entry?.word || pick.text}</h2>
          <div className="mt-1.5 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {sound.length > 0 && <p className="font-medium break-words">{sound[0]}</p>}
              {sound.length > 1 && <p className="text-sm break-words text-dim">{sound[1]}</p>}
              {saying && saying !== '…' && <p className="text-sm text-bad">{saying}</p>}
            </div>
            <button aria-label="Hear it" title="Hear it" onClick={say} disabled={saying === '…'}
              className="grid size-10 shrink-0 place-items-center rounded-full border border-line-strong
                hover:bg-hover active:bg-pressed disabled:opacity-50">
              {saying === '…' ? <Spinner size={16} /> : <Volume2 size={18} />}</button>
          </div>
          <button onClick={onRead} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg
            border border-line-strong font-medium hover:bg-hover active:bg-pressed">
            <Play size={14} />Read from here</button>
        </div>
        <Meanings entry={entry} />
      </div>
    </aside>
  )
}
