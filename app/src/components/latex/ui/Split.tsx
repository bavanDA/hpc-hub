import { useRef, useState, type ReactNode } from 'react'

import { remember, remembered } from '../storage'

/** Two panes side by side with a handle between; the split (a fraction) is remembered under `name`. */
export function Split({ name, left, right, show, min = 0.2 }:
  { name: string; left: ReactNode; right: ReactNode; show: 'both' | 'left' | 'right'; min?: number }) {
  const key = `latex.split.${name}`
  const [part, setPart] = useState(() => Number(remembered(key, '')) || 0.5)
  const box = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const drag = (e: React.PointerEvent) => {
    e.preventDefault()
    const r = box.current!.getBoundingClientRect()
    setDragging(true)
    const move = (m: PointerEvent) => setPart(Math.max(min, Math.min(1 - min, (m.clientX - r.left) / r.width)))
    const up = () => {
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setPart((p) => { remember(key, String(p)); return p })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const both = show === 'both'
  return (
    <div ref={box} className={`flex min-h-0 min-w-0 flex-1 ${dragging ? 'cursor-col-resize select-none' : ''}`}>
      <div style={both ? { width: `${part * 100}%` } : undefined}
        className={`min-w-0 ${show === 'right' ? 'hidden' : both ? 'shrink-0' : 'flex-1'} ${dragging ? 'pointer-events-none' : ''}`}>
        {left}</div>
      {both && <div onPointerDown={drag} role="separator" aria-orientation="vertical"
        className="group relative w-[5px] shrink-0 cursor-col-resize bg-line hover:bg-accent/60">
        <div className="absolute inset-y-0 -left-1 -right-1" /></div>}
      <div className={`min-w-0 flex-1 ${show === 'left' ? 'hidden' : ''} ${dragging ? 'pointer-events-none' : ''}`}>
        {right}</div>
    </div>
  )
}
