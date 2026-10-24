// A small menu that opens at a point and closes on any click outside or Escape (Adwaita's popover menu).
import { useEffect, useRef, type ReactNode } from 'react'

export function Popover({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [onClose])
  // Keep it inside the window
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - 200)
  return (
    <div ref={ref} style={{ left, top }}
      className="fixed z-30 flex min-w-[200px] flex-col rounded-xl bg-card p-1.5 shadow-[var(--shadow-card)] ring-1 ring-line">
      {children}
    </div>
  )
}

export function MenuItem({ children, onClick, danger = false }:
  { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-left hover:bg-hover ${danger ? 'text-bad' : ''}`}>{children}</button>
  )
}

export function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size,
    background: color || 'var(--color-dim)', opacity: color ? 1 : 0.5 }} />
}
