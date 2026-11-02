// The PDF pane: the shared pdf.js viewer, where a double-tap on a page jumps to its source line (SyncTeX).
// The viewer listens for double-clicks; phones don't always send one for a double-tap, so this turns two quick
// taps in the same spot into one, and drops the browser's own so a double-tap never asks twice.
import { useEffect, useRef, type ReactNode } from 'react'

import type { PdfTarget } from '@shared/components/pdf'
import { ReadAloudPdf } from '../ReadAloudPdf'

const GAP = 350  // ms between the two taps
const NEAR = 30  // px between them
const STILL = 10  // px a finger may move and still count as a tap

export function PdfPane({ data, path, cluster, memory, loading, progress, message, target, onSync }: {
  data: Uint8Array | null; path?: string; cluster: string; memory: string; loading: boolean; progress: number
  message?: ReactNode
  target: PdfTarget | null; onSync: (page: number, x: number, y: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)

  // Native listeners on the way down (capture), so they run before the viewer's own
  useEffect(() => {
    const el = box.current
    if (!el) return
    let down = { x: 0, y: 0 }, last = { t: 0, x: 0, y: 0 }, made = 0
    const start = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY } }
    const up = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return  // a mouse double-clicks by itself
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > STILL) return  // a scroll, not a tap
      const now = performance.now()
      if (now - last.t < GAP && Math.hypot(e.clientX - last.x, e.clientY - last.y) < NEAR) {
        last = { t: 0, x: 0, y: 0 }
        made = now
        e.target?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: e.clientX, clientY: e.clientY }))
      } else {
        last = { t: now, x: e.clientX, y: e.clientY }
      }
    }
    const native = (e: MouseEvent) => {
      if (e.isTrusted && performance.now() - made < 800) e.stopPropagation()
    }
    el.addEventListener('pointerdown', start, true)
    el.addEventListener('pointerup', up, true)
    el.addEventListener('dblclick', native, true)
    return () => {
      el.removeEventListener('pointerdown', start, true)
      el.removeEventListener('pointerup', up, true)
      el.removeEventListener('dblclick', native, true)
    }
  }, [])

  return (
    <div ref={box} className="h-full">
      <ReadAloudPdf data={data} source={path ? { cluster, path } : undefined} memory={memory} compact
        loading={loading} progress={progress} message={message} target={target} onSync={onSync} />
    </div>
  )
}
