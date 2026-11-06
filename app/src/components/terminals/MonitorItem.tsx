import type { LucideIcon } from 'lucide-react'

import { COLORS, type Level } from './monitorFormat'

export function MonitorItem({ icon: Icon, text, tip, level = '' }: { icon: LucideIcon; text: string; tip: string; level?: Level }) {
  return (
    <span title={tip} className={`flex shrink-0 items-center gap-1 ${COLORS[level]}`}>
      <Icon size={14} strokeWidth={2.25} className="shrink-0 opacity-80" />
      {text}
    </span>
  )
}
