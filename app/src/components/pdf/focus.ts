import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

import { useLatest } from './useLatest'

/** Focus as the parent's (it hides its own bars too) or this viewer's own. */
export function useFocus(on?: boolean, onChange?: (on: boolean) => void): [boolean, (on: boolean) => void] {
  const [own, setOwn] = useState(false)
  return on === undefined ? [own, (v) => { setOwn(v); onChange?.(v) }] : [on, (v) => onChange?.(v)]
}

const typing = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]')

/** F turns focus on from inside the viewer; while on, F and Esc anywhere turn it off (before a dialog's Esc). */
export function useFocusKeys(on: boolean, set: (on: boolean) => void) {
  const toggle = (e: React.KeyboardEvent) => {
    if (on || e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || e.key.toLowerCase() !== 'f') return
    e.preventDefault()
    set(true)
  }
  const latest = useLatest(set)
  useEffect(() => {
    if (!on) return
    const key = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return
      if (e.key === 'Escape' || e.key.toLowerCase() === 'f') {
        e.preventDefault()
        e.stopPropagation()
        latest.current(false)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [on, latest])
  return toggle
}

/** Keeps the page where it is when the bars above hide or come back: the content gets the bars' height as padding. */
export function useNoJump(scroller: RefObject<HTMLElement | null>, content: RefObject<HTMLElement | null>,
  on: boolean) {
  const top = useRef<number | null>(null)  // the scroller's top before this change
  const pad = useRef(0)
  useEffect(() => {  // follows other changes above it (the Read aloud player opening)
    const el = scroller.current
    if (!el) return
    const seen = new ResizeObserver(() => { top.current = el.getBoundingClientRect().top })
    seen.observe(el)
    return () => seen.disconnect()
  }, [scroller])
  useLayoutEffect(() => {
    const el = scroller.current, inner = content.current
    if (!el) return
    const now = el.getBoundingClientRect().top
    if (top.current !== null) pad.current = on ? Math.max(0, pad.current + top.current - now) : 0
    if (inner) inner.style.paddingTop = pad.current ? `${pad.current}px` : ''
    top.current = now
  }, [on, scroller, content])
}
