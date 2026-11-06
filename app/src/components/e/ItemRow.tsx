import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** onPress makes the name part a button; trailing holds the row's own buttons, outside it. */
export function ItemRow({ icon: Icon, label, sub, title, onPress, trailing }: {
  icon?: LucideIcon; label: ReactNode; sub?: ReactNode; title?: string; onPress?: () => void; trailing?: ReactNode
}) {
  const body = (
    <>
      {Icon && <Icon size={20} className="shrink-0 text-dim" />}
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
    </>
  )
  const main = 'flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 pl-5 text-left'
  return (
    <div title={title} className="flex items-center border-b border-line">
      {onPress
        ? <button onClick={onPress} className={`${main} ${trailing ? 'pr-3' : 'pr-5'} hover:bg-hover active:bg-pressed`}>
            {body}</button>
        : <div className={`${main} ${trailing ? 'pr-3' : 'pr-5'}`}>{body}</div>}
      {trailing && <div className="flex shrink-0 items-center gap-1 pr-3">{trailing}</div>}
    </div>
  )
}
