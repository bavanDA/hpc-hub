import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type MenuItem = { label: string; onClick: () => void; danger?: boolean }

export function ContextMenu({ x, y, sections, onClose }:
  { x: number; y: number; sections: MenuItem[][]; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useLayoutEffect(() => {  // keep it inside the window
    const r = box.current?.getBoundingClientRect()
    if (!r) return
    setPos({ left: Math.max(4, Math.min(x, innerWidth - r.width - 4)),
      top: Math.max(4, Math.min(y, innerHeight - r.height - 4)) })
  }, [x, y])

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    window.addEventListener('blur', onClose)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('blur', onClose) }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-30" onMouseDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose() }}>
      <div ref={box} style={pos} onMouseDown={(e) => e.stopPropagation()}
        className="menu-in fixed min-w-[200px] rounded-lg bg-raised py-1 shadow-[var(--shadow-menu)]">
        {sections.filter((s) => s.length).map((s, i) => (
          <div key={i} className={i ? 'mt-1 border-t border-line pt-1' : ''}>
            {s.map((item) => (
              <button key={item.label} onClick={() => { onClose(); item.onClick() }}
                className={`flex h-9 w-full items-center px-3 text-left hover:bg-hover active:bg-pressed ${
                  item.danger ? 'text-bad' : ''}`}>
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
