import { Check, type Folder } from 'lucide-react'

export function MenuItem({ icon: Icon, label, sub, on = false, onClick }:
  { icon: typeof Folder; label: string; sub?: string; on?: boolean; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} title={sub}
      className="flex min-h-9 w-full items-center gap-3 px-3 py-1 text-left hover:bg-hover active:bg-pressed">
      <Icon size={16} className="shrink-0 text-dim" />
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${on ? 'font-semibold' : ''}`}>{label}</span>
        {sub && <span className="block truncate font-mono text-xs text-dim">{sub}</span>}
      </span>
      {on && <Check size={16} aria-label="Open" className="shrink-0" />}
    </button>
  )
}
