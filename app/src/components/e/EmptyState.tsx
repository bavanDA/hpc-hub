import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { ReportLink } from '../report/ReportLink'

/** report: this is an error; a quiet Report sends the title and text. */
export function EmptyState({ icon: Icon, title, text, action, report = false }:
  { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode; report?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
      <Icon size={28} className="mb-1 text-dim" />
      <h2 className="text-md font-semibold">{title}</h2>
      {text && <p className="max-w-[44ch] text-dim">{text}</p>}
      {action && <div className="mt-3 flex gap-2">{action}</div>}
      {report && <ReportLink className="mt-1" error={typeof text === 'string' ? `${title}: ${text}` : title} />}
    </div>
  )
}
