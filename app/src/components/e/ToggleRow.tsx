import type { ReactNode } from 'react'

import { ROW } from './styles'

export function ToggleRow({ label, sub, checked, onChange }:
  { label: string; sub?: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={`${ROW} hover:bg-hover`}>
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only" />
      <span className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent
        peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus
        after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full after:bg-window after:transition
        peer-checked:after:translate-x-4 peer-checked:after:bg-on-accent" />
    </label>
  )
}
