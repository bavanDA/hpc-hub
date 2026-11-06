import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { ROW } from './styles'

export function Row({ label, sub, value, icon: Icon, opens = false, onPress, danger = false, children }: {
  label: ReactNode; sub?: ReactNode; value?: ReactNode; icon?: LucideIcon; opens?: boolean; onPress?: () => void
  danger?: boolean; children?: ReactNode
}) {
  const body = (
    <>
      {Icon && <Icon size={18} className={`shrink-0 ${danger ? 'text-bad' : 'text-dim'}`} />}
      <span className="min-w-0 flex-1 break-words">
        <span className={`block ${danger ? 'text-bad' : ''}`}>{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
      {value !== undefined && <span className="max-w-[60%] text-right font-medium break-words tabular-nums">
        {value}</span>}
      {children}
      {opens && <ChevronRight size={16} className="-mr-1 shrink-0 text-dim" />}
    </>
  )
  return onPress
    ? <button type="button" onClick={onPress} className={`${ROW} hover:bg-hover active:bg-pressed`}>{body}</button>
    : <div className={ROW}>{body}</div>
}
