import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

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
