import { useCallback, useState, type ReactNode } from 'react'

import { useOutside } from '../useOutside'

/** A panel under its button; a click outside or Escape closes it. */
export function Popover({ button, children, align = 'right', width = 280 }:
  { button: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode;
    align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const box = useOutside(open, close)
  return (
    <div ref={box} className="relative">
      {button(open, () => setOpen(!open))}
      {open && (
        <div style={{ width }} className={`absolute top-full z-30 mt-1.5 rounded-xl border border-line bg-window p-1.5
          shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(close)}
        </div>
      )}
    </div>
  )
}
