// Mounted once in each app, inside the toasts: opens the report window when anything asks (open.ts), and turns an
// error nothing caught (catchers.ts) into one quiet toast with Report. The phone wraps the window for Android's Back.
import { useEffect, useState, type ReactNode } from 'react'

import { useToast } from '../useToast'
import { onCaught } from './catchers'
import { onOpenReport, type ReportStart } from './open'
import { ReportDialog } from './ReportDialog'

export function ReportHost({ wrap = (n) => n }: { wrap?: (dialog: ReactNode, close: () => void) => ReactNode }) {
  const toast = useToast()
  const [start, setStart] = useState<ReportStart | null>(null)
  useEffect(() => onOpenReport(setStart), [])
  useEffect(() => onCaught((c) => {
    const error = c.stack && !c.stack.includes(c.message) ? `${c.message}\n\n${c.stack}` : c.stack || c.message
    toast(`Something went wrong: ${c.message}`, { kind: 'error', report: { kind: 'error', error } })
  }), [toast])
  if (!start) return null
  const close = () => setStart(null)
  return wrap(<ReportDialog start={start} onClose={close} />, close)
}
