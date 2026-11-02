// A button that opens a popover menu (like a GTK MenuButton). The menu is fixed to the window, so a list card
// that clips its rows never cuts it off.
import type { LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type MenuItem = { label: string; icon?: LucideIcon; onClick: () => void; danger?: boolean }

/** groups: items between separators; trigger: what the button shows. */
export function Menu({ groups, trigger, label, className = '' }:
  { groups: MenuItem[][]; trigger: ReactNode; label: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ top: number; right: number; up: boolean } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const height = menu.current?.offsetHeight ?? 0
    const up = r.bottom + 6 + height > window.innerHeight && r.top - 6 - height > 0
    setAt({ top: up ? r.top - 6 - height : r.bottom + 6, right: window.innerWidth - r.right, up })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
      if (e.target instanceof Node && (menu.current?.contains(e.target) || button.current?.contains(e.target))) return
      setOpen(false)
    }
    const events = ['mousedown', 'keydown', 'resize', 'scroll'] as const
    events.forEach((n) => window.addEventListener(n, close, true))
    return () => events.forEach((n) => window.removeEventListener(n, close, true))
  }, [open])

  return (
    <>
      <button ref={button} aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen(!open)}
        className={`${className} ${open ? 'bg-selected' : ''}`}>
        {trigger}
      </button>
      {open && (
        <div ref={menu} role="menu" style={{ top: at?.top ?? -9999, right: at?.right ?? 0 }}
          className="menu-in fixed z-50 min-w-[200px] rounded-xl bg-raised p-1.5 shadow-[var(--shadow-menu)]">
          {groups.filter((g) => g.length).map((g, n) => (
            <div key={n} className={n ? 'mt-1.5 border-t border-line pt-1.5' : ''}>
              {g.map(({ label: text, icon: Icon, onClick, danger }) => (
                <button key={text} role="menuitem" onClick={() => { setOpen(false); onClick() }}
                  className={`flex h-9 w-full items-center gap-3 rounded-md px-2.5 text-left hover:bg-hover ${
                    danger ? 'text-bad' : ''}`}>
                  {Icon && <Icon size={16} className={`shrink-0 ${danger ? '' : 'text-dim'}`} />}
                  <span className="truncate">{text}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
