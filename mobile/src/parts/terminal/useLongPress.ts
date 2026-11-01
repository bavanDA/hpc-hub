// A row that opens on tap and shows its actions on a long press (about half a second), like Android's lists.
// Moving the finger (scrolling) cancels it; the click that follows a long press is swallowed.
import { useRef } from 'react'

const HOLD_MS = 500
const SLOP = 10  // px the finger may move and still count as holding

export function useLongPress(onTap: () => void, onLong: () => void) {
  const timer = useRef(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)
  const clear = () => { window.clearTimeout(timer.current); start.current = null }
  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = window.setTimeout(() => { fired.current = true; start.current = null; onLong() }, HOLD_MS)
    },
    onPointerMove: (e: React.PointerEvent) => {
      const s = start.current
      if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > SLOP) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear,
    // the WebView's own long-press menu would cover ours
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => { if (fired.current) fired.current = false; else onTap() },
  }
}
