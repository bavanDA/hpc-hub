// Tabs at the top of a page (Agents, Files): one row, the current one underlined. Arrow keys move between them.
import type { LucideIcon } from 'lucide-react'
import { useRef } from 'react'

export type TabItem<T extends string> = { id: T; title: string; icon?: LucideIcon }

export function Tabs<T extends string>({ tabs, current, onPick, label }:
  { tabs: TabItem<T>[]; current: T; onPick: (id: T) => void; label: string }) {
  const row = useRef<HTMLDivElement>(null)
  const key = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === current)
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -2
    if (next === -2) return
    const t = tabs[(next + tabs.length) % tabs.length]
    onPick(t.id)
    row.current?.querySelector<HTMLButtonElement>(`[data-tab="${t.id}"]`)?.focus()
  }
  return (
    <div ref={row} role="tablist" aria-label={label} onKeyDown={key}
      className="flex shrink-0 gap-1 border-b border-line px-4">
      {tabs.map(({ id, title, icon: Icon }) => (
        <button key={id} data-tab={id} role="tab" aria-selected={id === current} tabIndex={id === current ? 0 : -1}
          onClick={() => onPick(id)}
          className={`-mb-px flex h-11 items-center gap-2 border-b-2 px-3 font-semibold transition-colors ${
            id === current ? 'border-accent text-text' : 'border-transparent text-dim hover:text-text'}`}>
          {Icon && <Icon size={16} />}{title}
        </button>
      ))}
    </div>
  )
}
