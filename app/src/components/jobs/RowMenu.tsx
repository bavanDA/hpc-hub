import { MoreVertical } from 'lucide-react'
import { useEffect, useRef } from 'react'

/** ⋮ on a row, shown on hover or focus: details, and cancel (which asks first). */
export function RowMenu({ open, setOpen, onDetails, onCancel }: {
  open: boolean; setOpen: (v: boolean) => void; onDetails: () => void; onCancel: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [open, setOpen])
  const pick = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); setOpen(false); fn() }
  return (
    <div ref={box} className="relative inline-block" onClick={(e) => e.stopPropagation()}>
      <button aria-label="Job actions" title="Job actions" aria-expanded={open} onClick={() => setOpen(!open)}
        className={`grid size-7 place-items-center rounded-md text-dim transition-opacity duration-90 hover:bg-selected
          hover:text-text focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100
          ${open ? 'opacity-100' : 'opacity-0'}`}><MoreVertical size={16} /></button>
      {open && (
        <div role="menu" className="menu-in absolute right-0 top-full z-30 mt-1 min-w-[160px] rounded-lg bg-raised py-1
          text-left shadow-[var(--shadow-menu)]">
          <button role="menuitem" onClick={pick(onDetails)}
            className="flex h-9 w-full items-center px-3 hover:bg-hover">Details</button>
          <button role="menuitem" onClick={pick(onCancel)}
            className="flex h-9 w-full items-center px-3 text-bad hover:bg-hover">
            Cancel job…</button>
        </div>
      )}
    </div>
  )
}
