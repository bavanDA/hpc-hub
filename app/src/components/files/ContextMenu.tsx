// A right-click menu at the pointer, in sections like GTK's popover menus. Click outside or Escape closes it.
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
        className="fixed min-w-[200px] rounded-xl border border-line bg-window p-1.5 shadow-xl">
        {sections.filter((s) => s.length).map((s, i) => (
          <div key={i} className={i ? 'mt-1.5 border-t border-line pt-1.5' : ''}>
            {s.map((item) => (
              <button key={item.label} onClick={() => { onClose(); item.onClick() }}
                className={`flex h-8 w-full items-center rounded-md px-3 text-left hover:bg-hover ${
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
