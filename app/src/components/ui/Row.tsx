import type { ReactNode } from 'react'

export function Row({ title, subtitle, prefix, suffix, onClick }:
  { title: ReactNode; subtitle?: ReactNode; prefix?: ReactNode; suffix?: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`flex min-h-12 items-center gap-3 px-4 py-2 ${
      onClick ? 'transition-colors duration-90 hover:bg-hover active:bg-pressed' : ''}`}>
      {prefix}
      <div className="min-w-0 flex-1">
        <div className="truncate">{title}</div>
        {subtitle && <div className="truncate text-sm text-dim">{subtitle}</div>}
      </div>
      {suffix}
    </div>
  )
}
