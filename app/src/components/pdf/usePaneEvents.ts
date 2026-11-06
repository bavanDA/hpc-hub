import { useEffect, type RefObject } from 'react'

import type { Live } from './live'
import { spotAt } from './points'
import { FITS, places } from './zoom'

type Sync = ((page: number, x: number, y: number) => void) | undefined

/** Remembers zoom and scroll, fits again when the pane changes size, zooms on ctrl+wheel, SyncTeX on double click. */
export function usePaneEvents(scroller: RefObject<HTMLDivElement | null>, live: RefObject<Live | null>,
  restoring: RefObject<boolean>, mem: RefObject<{ memory?: string }>, sync: RefObject<Sync>, ready: boolean) {
  useEffect(() => {
    const el = scroller.current
    if (!el || !ready) return
    const save = () => {
      const me = live.current
      if (mem.current.memory && me?.doc && !restoring.current) {
        places.set(mem.current.memory, { scale: me.viewer.currentScaleValue, top: el.scrollTop, left: el.scrollLeft })
      }
    }
    let frame = 0
    const resized = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const v = live.current?.viewer
        const value = v?.currentScaleValue
        if (v?.pdfDocument && value && FITS.includes(value)) v.currentScaleValue = value
      })
    })
    resized.observe(el)
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      live.current?.viewer.updateScale({ steps: e.deltaY < 0 ? 1 : -1, origin: [e.clientX, e.clientY] })
    }
    const dbl = (e: MouseEvent) => {
      const me = live.current
      if (!sync.current || !me) return
      const spot = spotAt(me.viewer, e.clientX, e.clientY, e.target)
      if (!spot) return
      window.getSelection()?.removeAllRanges()
      sync.current(spot.page, spot.x, spot.y)
    }
    el.addEventListener('scroll', save, { passive: true })
    el.addEventListener('wheel', wheel, { passive: false })
    el.addEventListener('dblclick', dbl)
    return () => {
      el.removeEventListener('scroll', save)
      el.removeEventListener('wheel', wheel)
      el.removeEventListener('dblclick', dbl)
      resized.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [ready, mem, sync, scroller, live, restoring])
}
