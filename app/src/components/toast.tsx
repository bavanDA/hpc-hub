// Short messages at the bottom of the window, like GTK's toasts: const toast = useToast(); toast('Saved').
// An error stays until you close it, and a toast can carry one button:
// toast('Could not connect', { kind: 'error', action: { label: 'Retry', run: retry } })
import { CircleAlert, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export type ToastOptions = { kind?: 'info' | 'error'; action?: { label: string; run: () => void } }
type Toast = { id: number; text: string } & ToastOptions

const ToastContext = createContext<(text: string, options?: ToastOptions) => void>(() => {})
const SHOWN_MS = 4000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const drop = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const toast = useCallback((text: string, options: ToastOptions = {}) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.filter((x) => x.text !== text), { id, text, ...options }].slice(-4))
    if (options.kind !== 'error') setTimeout(() => drop(id), options.action ? SHOWN_MS * 2 : SHOWN_MS)
  }, [drop])
  useEffect(() => {  // a plain browser (design work): ?toast=error shows one
    if ('__TAURI_INTERNALS__' in window || new URLSearchParams(location.search).get('toast') !== 'error') return
    toast('Could not connect to SDSC Expanse: the login was refused.',
      { kind: 'error', action: { label: 'Try again', run: () => {} } })
  }, [toast])
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center
        gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
            className="menu-in pointer-events-auto flex max-w-[640px] items-center gap-3 rounded-xl bg-[#353538] py-2
              pr-2 pl-4 text-sm text-white shadow-[var(--shadow-dialog)]">
            {t.kind === 'error' && <CircleAlert size={16} className="shrink-0 text-[#ff8a78]" />}
            <span className="min-w-0 flex-1 py-0.5">{t.text}</span>
            {t.action && (
              <button onClick={() => { drop(t.id); t.action!.run() }}
                className="shrink-0 rounded-md px-2.5 py-1 font-semibold text-[#7cb1f0] hover:bg-white/10">
                {t.action.label}</button>
            )}
            {(t.kind === 'error' || t.action) && (
              <button onClick={() => drop(t.id)} aria-label="Close"
                className="grid size-7 shrink-0 place-items-center rounded-md text-white/70 hover:bg-white/10">
                <X size={14} /></button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
