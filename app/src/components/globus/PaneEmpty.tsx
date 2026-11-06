import type { LucideIcon } from 'lucide-react'

import { Button } from '../ui/Button'

export function PaneEmpty({ icon: Icon, title, text, button, onClick }:
  { icon: LucideIcon; title: string; text?: string; button?: string; onClick?: () => void }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <Icon size={40} strokeWidth={1.25} className="text-dim" />
      <h3 className="text-lg font-semibold leading-snug">{title}</h3>
      {text && <p className="max-w-xs text-sm text-dim">{text}</p>}
      {button && <Button kind="primary" onClick={onClick}>{button}</Button>}
    </div>
  )
}
