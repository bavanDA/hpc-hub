import { useEffect, type RefObject } from 'react'

import type { WordPick } from './index'
import type { Live } from './live'
import type { Narrator } from './narrator'
import { spotAt, textAt } from './points'

type Refs = {
  live: RefObject<Live | null>
  scroller: RefObject<HTMLDivElement | null>
  onWord: RefObject<((w: WordPick) => void) | undefined>
  onLookUp: RefObject<((w: WordPick) => void) | undefined>
  onSync: RefObject<((page: number, x: number, y: number) => void) | undefined>
}

/** Read aloud on the pages: the spoken word drawn and followed, a click reads from a word, a right-click or a
 *  hold picks it, a double-click looks it up. */
export function useWordEvents(ready: boolean, reader: Narrator | undefined, refs: Refs) {
  const { live, scroller, onWord, onLookUp, onSync } = refs
  useEffect(() => {
    const me = live.current, el = scroller.current
    if (!ready || !me || !el) return
    const pick = (x: number, y: number, target: EventTarget | null, touch: boolean) => {
      const text = textAt(x, y), spot = spotAt(me.viewer, x, y, target)
      if (!text || !spot || !onWord.current) return false
      onWord.current({ text, spot, x, y, touch })
      return true
    }

    let mark: HTMLDivElement | null = null, scrolled = 0, wait = 0, hold = 0, held = 0, at = { x: 0, y: 0 }
    const draw = (follow: boolean) => {
      const id = reader?.current ?? null
      const w = id === null ? undefined : reader?.words.get(id)
      const view = w && me.viewer.getPageView(w[0] - 1)
      if (!w || !view?.viewport || !view.div) { mark?.remove(); return }
      const box = view.viewport.viewBox
      const [ax, ay] = view.viewport.convertToViewportPoint(w[1] + box[0], box[3] - w[2])
      const [bx, by] = view.viewport.convertToViewportPoint(w[3] + box[0], box[3] - w[4])
      mark ??= Object.assign(document.createElement('div'), { className: 'pdf-word' })
      if (mark.parentNode !== view.div) view.div.appendChild(mark)
      Object.assign(mark.style, { left: `${Math.min(ax, bx) - 2}px`, top: `${Math.min(ay, by) - 1}px`,
        width: `${Math.abs(bx - ax) + 4}px`, height: `${Math.abs(by - ay) + 2}px` })
      if (!follow || Date.now() - scrolled < 4000) return  // you just scrolled yourself: leave the view alone
      const m = mark.getBoundingClientRect(), c = el.getBoundingClientRect()
      if (m.bottom > c.bottom - 40 || m.top < c.top + 40) {
        el.scrollBy({ top: m.top - c.top - c.height / 3, behavior: 'smooth' })
      }
    }
    const redraw = () => draw(false)
    const off = reader?.onWord(() => draw(true))
    reader?.watchPage(() => me.viewer.currentPageNumber || 1)
    me.bus.on('pagerendered', redraw)
    const mine = () => { scrolled = Date.now() }

    const click = (e: MouseEvent) => {
      if (e.detail !== 1 || !reader?.ready || Date.now() - held < 800) return
      if ((e.target as HTMLElement).closest('a, .annotationLayer') || !window.getSelection()?.isCollapsed) return
      const spot = spotAt(me.viewer, e.clientX, e.clientY, e.target)
      if (!spot || reader.wordAt(spot.page, spot.x, spot.y) === null) return
      clearTimeout(wait)
      wait = window.setTimeout(() => reader.readFrom(spot), 380)  // a double click is SyncTeX instead
    }
    const dbl = (e: MouseEvent) => {
      clearTimeout(wait)
      if (onSync.current || !onLookUp.current) return
      const text = textAt(e.clientX, e.clientY), spot = spotAt(me.viewer, e.clientX, e.clientY, e.target)
      if (text && spot) onLookUp.current({ text, spot, x: e.clientX, y: e.clientY, touch: false })
    }
    const menu = (e: MouseEvent) => {
      if (Date.now() - held < 800) { e.preventDefault(); return }
      if (onWord.current && pick(e.clientX, e.clientY, e.target, false)) e.preventDefault()
    }
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || !onWord.current) return
      at = { x: e.clientX, y: e.clientY }
      const target = e.target
      clearTimeout(hold)
      hold = window.setTimeout(() => {
        if (!pick(at.x, at.y, target, true)) return
        held = Date.now()
        window.getSelection()?.removeAllRanges()
        // lifting the finger may still click, now on what the hold opened: that click is not meant
        const swallow = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault() }
        window.addEventListener('click', swallow, { capture: true, once: true })
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 1500)
      }, 500)
    }
    const move = (e: PointerEvent) => { if (Math.hypot(e.clientX - at.x, e.clientY - at.y) > 10) clearTimeout(hold) }
    const up = () => clearTimeout(hold)
    const listen: [string, EventListener][] = [['click', click as EventListener], ['dblclick', dbl as EventListener],
      ['contextmenu', menu as EventListener], ['pointerdown', down as EventListener],
      ['pointermove', move as EventListener], ['pointerup', up], ['pointercancel', up], ['wheel', mine],
      ['touchmove', mine], ['keydown', mine]]
    for (const [name, fn] of listen) el.addEventListener(name, fn, { passive: name !== 'contextmenu' })
    return () => {
      off?.()
      me.bus.off('pagerendered', redraw)
      for (const [name, fn] of listen) el.removeEventListener(name, fn)
      clearTimeout(wait)
      clearTimeout(hold)
      mark?.remove()
    }
  }, [ready, reader, live, scroller, onWord, onLookUp, onSync])
}
