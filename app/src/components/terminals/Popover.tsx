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
      className="menu-in fixed z-30 flex min-w-[200px] flex-col rounded-lg bg-raised py-1 shadow-[var(--shadow-menu)]">
      {children}
    </div>
  )
}
