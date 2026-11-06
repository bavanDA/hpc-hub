import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { Switch } from './Switch'

export function IconToggleRow({ icon: Icon, label, sub, checked, onChange, disabled }: {
  icon?: LucideIcon; label: string; sub?: ReactNode; checked: boolean; onChange: (on: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={`flex min-h-12 w-full items-center gap-3 border-b border-line px-5 py-2 text-left
      ${disabled ? 'opacity-60' : 'hover:bg-hover'}`}>
      {Icon && <Icon size={20} className="shrink-0 text-dim" />}
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </label>
  )
}
