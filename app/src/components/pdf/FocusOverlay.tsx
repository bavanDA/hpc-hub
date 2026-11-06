import { Maximize, Minimize2 } from 'lucide-react'
import { useEffect, useState } from 'react'

const PILL = 'absolute z-20 flex items-center gap-2 rounded-full bg-raised text-sm shadow-[var(--shadow-menu)]'
const KEY = 'rounded border border-line-strong bg-window px-1.5 text-xs leading-4 font-medium text-dim'

/** What shows over the paper while the bars are hidden: a hint that fades, a way back, the page count. */
export function FocusOverlay({ what, page, pages, onExit }:
  { what: string; page: number; pages: number; onExit: () => void }) {
  const [hint, setHint] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setHint(false), 3000)
    return () => clearTimeout(t)
  }, [])
  return (
    <>
      <div role="status" className={`${PILL} top-4 left-1/2 h-9 -translate-x-1/2 pr-1.5 pl-3.5 whitespace-nowrap
        transition-opacity duration-700 ${hint ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        <Maximize size={14} className="shrink-0" />
        <span>{what}. Press <kbd className={KEY}>F</kbd> or <kbd className={KEY}>Esc</kbd> to show the bars.</span>
        <button onClick={onExit} className="h-[26px] rounded-full bg-control px-2.5 font-medium hover:bg-pressed">
          Show bars</button>
      </div>
      <button onClick={onExit} aria-label="Show the bars (F)" title="Show the bars (F)"
        className={`${PILL} top-4 right-4 size-8 justify-center opacity-90 hover:opacity-100`}>
        <Minimize2 size={14} /></button>
      {pages > 0 && <div className={`${PILL} right-4 bottom-4 h-8 px-3 tabular-nums text-dim`}>
        <span className="font-semibold text-text">{page}</span> / {pages}</div>}
    </>
  )
}
