import { Check } from 'lucide-react'
import type { ReactNode } from 'react'

export function CheckRow({ label, value, checked, onChange }:
  { label: ReactNode; value?: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center gap-3 border-b border-line px-5 py-2 text-left hover:bg-hover
        active:bg-pressed">
      <span className={`grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] ${checked
        ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'}`}>{checked && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 break-all">{label}</span>
      {value !== undefined && <span className="shrink-0 font-medium tabular-nums">{value}</span>}
    </button>
  )
}
