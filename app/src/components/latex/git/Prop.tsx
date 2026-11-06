import type { ReactNode } from 'react'

export function Prop({ label, value, action }: { label: string; value: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center gap-3 px-4 py-1.5">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-dim">{label}</div>
        <div className="truncate select-text font-mono text-sm">{value}</div>
      </div>
      {action}
    </div>
  )
}
