import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { ReportLink } from '../report/ReportLink'

/** report: this is an error; a quiet Report sends the title and text. */
export function EmptyState({ icon: Icon, title, text, action, secondary, report = false }: {
  icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode; secondary?: ReactNode; report?: boolean
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <Icon size={28} className="mb-1 text-dim" />
      <h2 className="text-md font-semibold">{title}</h2>
      {text && <p className="max-w-[44ch] text-base text-dim">{text}</p>}
      {(action || secondary) && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {action}{secondary}</div>}
      {report && <ReportLink className="mt-1" error={typeof text === 'string' ? `${title}: ${text}` : title} />}
    </div>
  )
}
