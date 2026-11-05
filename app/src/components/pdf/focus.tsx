// Just the PDF (or just the text): the bars above hide so only the paper shows. F or Esc brings them back, a hint
// says so and fades, and a small button at the top right and the page count stay.
import { Maximize, Minimize2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

import { Tool } from './tool'

/** Focus as the parent's (Project hides its header too) or this viewer's own. */
export function useFocus(on?: boolean, onChange?: (on: boolean) => void): [boolean, (on: boolean) => void] {
  const [own, setOwn] = useState(false)
  return on === undefined ? [own, (v) => { setOwn(v); onChange?.(v) }] : [on, (v) => onChange?.(v)]
}

const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')

/** F toggles from inside the viewer; while focused, F and Esc anywhere bring the bars back (before a dialog's Esc). */
export function useFocusKeys(on: boolean, set: (on: boolean) => void) {
  const toggle = (e: React.KeyboardEvent) => {
    if (on || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || e.key.toLowerCase() !== 'f') return
    e.preventDefault()
    set(true)
  }
  const setRef = useRef(set)
  setRef.current = set
  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      if (e.key === 'Escape' || e.key.toLowerCase() === 'f') {
        e.preventDefault()
        e.stopPropagation()
        setRef.current(false)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [on])
  return toggle
}

/** Keeps the page where it is when the bars above hide or come back: the content gets the bars' height as padding. */
export function useNoJump(scroller: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>,
  on: boolean) {
  const top = useRef<number | null>(null)
  const pad = useRef(0)
  useLayoutEffect(() => {
    const el = scroller.current, inner = content.current
    if (!el || !inner) return
    const now = el.getBoundingClientRect().top
    if (top.current !== null) {
      pad.current = on ? Math.max(0, pad.current + top.current - now) : 0
      inner.style.paddingTop = pad.current ? `${pad.current}px` : ''
    }
    top.current = now
  }, [on, scroller, content])
}

export function FocusButton({ onClick }: { onClick: () => void }) {
  return (
    <span className="contents pointer-coarse:hidden">
      <span className="mx-1 h-[18px] w-px shrink-0 bg-line" />
      <Tool label="Just the PDF (F)" onClick={onClick}><Maximize size={16} /></Tool>
    </span>
  )
}

const PILL = 'absolute z-20 flex items-center gap-2 rounded-full bg-raised text-sm shadow-[var(--shadow-menu)]'
const KEY = 'rounded border border-line-strong bg-window px-1.5 text-xs leading-4 font-medium text-dim'

/** What shows over the paper while the bars are hidden. */
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
