import type { ReactNode } from 'react'

export function MenuButton({ icon, label, hint, onClick, disabled }:
  { icon: ReactNode; label: string; hint?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-hover disabled:opacity-50">
      <span className="text-dim">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-xs text-dim">{hint}</span>}
    </button>
  )
}
