import type { ReactNode } from 'react'

import { ReportLink } from '../report/ReportLink'

/** report: the error as text, for a quiet Report after it (left out for mistakes the person can fix). */
export function DialogNote({ error = false, report, children }:
  { error?: boolean; report?: string; children: ReactNode }) {
  return <p role={error ? 'alert' : undefined} className={`px-5 pb-3 break-words ${error ? 'font-semibold text-bad'
    : 'font-semibold'}`}>{children}{report && <> <ReportLink className="ml-1 text-sm" error={report} /></>}</p>
}
