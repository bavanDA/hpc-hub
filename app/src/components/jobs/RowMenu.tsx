import { MoreVertical } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const MENU_HEIGHT = 82

/** ⋮ on a row, shown on hover or focus: details, and cancel (which asks first). The menu sits over the page, so
 *  the table's scroll box can't cut it and the rows under it can't cover it. */
export function RowMenu({ open, setOpen, onDetails, onCancel }: {
  open: boolean; setOpen: (v: boolean) => void; onDetails: () => void; onCancel: () => void
}) {
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; right: number } | null>(null)
  useLayoutEffect(() => {
    if (!open || !button.current) return setAt(null)
    const r = button.current.getBoundingClientRect()
    const below = r.bottom + 4 + MENU_HEIGHT <= window.innerHeight
    setAt({ top: below ? r.bottom + 4 : r.top - 4 - MENU_HEIGHT, right: window.innerWidth - r.right })
  }, [open])
  useEffect(() => {
    if (!open) return
    const inside = (t: EventTarget | null) => button.current?.contains(t as Node) || menu.current?.contains(t as Node)
    const away = (e: MouseEvent) => !inside(e.target) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    const close = () => setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('mousedown', away)
      window.removeEventListener('keydown', key)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, setOpen])
  const pick = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); setOpen(false); fn() }
  return (
    <div className="inline-block" onClick={(e) => e.stopPropagation()}>
      <button ref={button} aria-label="Job actions" aria-expanded={open} onClick={() => setOpen(!open)}
        className={`grid size-7 place-items-center rounded-md text-dim transition-opacity duration-90 hover:bg-selected
          hover:text-text focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100
          ${open ? 'opacity-100' : 'opacity-0'}`}><MoreVertical size={16} /></button>
      {open && at && createPortal(
        <div ref={menu} role="menu" style={{ top: at.top, right: at.right }} onClick={(e) => e.stopPropagation()}
          className="menu-in fixed z-50 min-w-[160px] rounded-lg bg-raised py-1 text-left shadow-[var(--shadow-menu)]">
          <button role="menuitem" onClick={pick(onDetails)}
            className="flex h-9 w-full items-center px-3 hover:bg-hover">Details</button>
          <button role="menuitem" onClick={pick(onCancel)}
            className="flex h-9 w-full items-center px-3 text-bad hover:bg-hover">
            Cancel job…</button>
        </div>, document.body)}
    </div>
  )
}
