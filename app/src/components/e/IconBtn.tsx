import type { LucideIcon } from 'lucide-react'

export function IconBtn({ icon: Icon, label, onClick, disabled }:
  { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="grid size-9 shrink-0 place-items-center rounded-md text-dim hover:bg-hover hover:text-text
        active:bg-pressed disabled:opacity-40"><Icon size={17} /></button>
  )
}
