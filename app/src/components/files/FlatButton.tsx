import type { LucideIcon } from 'lucide-react'

export function FlatButton({ icon: Icon, label, disabled, onClick, danger = false }:
  { icon: LucideIcon; label: string; disabled: boolean; onClick: () => void; danger?: boolean }) {
  return (
    <button title={label} aria-label={label} disabled={disabled} onClick={onClick}
      className={`grid size-9 place-items-center rounded-md text-dim hover:bg-hover hover:text-text
        disabled:pointer-events-none disabled:opacity-35 ${danger ? 'hover:text-bad' : ''}`}>
      <Icon size={18} />
    </button>
  )
}
