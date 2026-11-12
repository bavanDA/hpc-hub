import { CircleAlert, X } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'

import { errorReport, openReport, type ReportStart } from './report/open'
import { failureFor } from './report/recent'
import { ToastContext, type ToastOptions } from './useToast'

type Toast = { id: number; text: string; reportWith?: ReportStart } & ToastOptions

const SHOWN_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const drop = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback((text: string, options: ToastOptions = {}) => {
    const id = Date.now() + Math.random()
    // Report on errors only: an error toast, or one that shows the message of a call that just failed
    const reportWith = options.report === false ? undefined : options.report
      ?? (options.kind === 'error' || failureFor(text) ? errorReport(text) : undefined)
    setToasts((t) => [...t.filter((x) => x.text !== text), { id, text, reportWith, ...options }].slice(-4))
    if (options.kind !== 'error' && !options.stay) {
      setTimeout(() => drop(id), options.action || reportWith ? SHOWN_MS * 2 : SHOWN_MS)
    }
    return () => drop(id)
  }, [drop])
  useEffect(() => {  // a plain browser (design work): ?toast=error shows one
    if ('__TAURI_INTERNALS__' in window || new URLSearchParams(location.search).get('toast') !== 'error') return
    toast('Could not connect: the sign-in was refused.',
      { kind: 'error', action: { label: 'Try again', run: () => {} } })
  }, [toast])
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center
        gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className="menu-in pointer-events-auto flex min-h-11 max-w-[640px] flex-wrap items-center gap-x-3 rounded-lg
              bg-text py-1.5 pr-1.5 pl-4 text-base text-window">
            {t.kind === 'error' && <CircleAlert size={16} className="shrink-0" />}
            {/* on a phone the buttons go under the text when they don't fit beside it */}
            <span className="min-w-[12rem] flex-1 py-0.5">{t.text}</span>
            <span className="ml-auto flex shrink-0 items-center">
            {t.action && (
              <button onClick={() => { drop(t.id); t.action!.run() }}
                className="shrink-0 rounded-md px-2.5 py-1 font-semibold underline underline-offset-2
                  hover:bg-window/15">
                {t.action.label}</button>
            )}
            {t.reportWith && (
              <button onClick={() => { drop(t.id); openReport(t.reportWith!) }}
                className="shrink-0 rounded-md px-2.5 py-1 font-semibold text-window/75 hover:bg-window/15
                  hover:text-window">Report</button>
            )}
            {(t.kind === 'error' || t.stay || t.action || t.reportWith) && (
              <button onClick={() => drop(t.id)} aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-md text-window/70 hover:bg-window/15">
                <X size={16} /></button>
            )}
            </span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
