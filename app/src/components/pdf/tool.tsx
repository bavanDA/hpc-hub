import type { ReactNode } from 'react'

export function Tool({ label, onClick, children, on = false, disabled = false }:
  { label: string; onClick: () => void; children: ReactNode; on?: boolean; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled} aria-pressed={on || undefined}
      className={`grid size-7 shrink-0 place-items-center rounded-md disabled:opacity-40 pointer-coarse:size-11 ${
        on ? 'bg-selected' : 'hover:bg-hover'}`}>{children}</button>
  )
}
