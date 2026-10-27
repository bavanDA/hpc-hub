// The phone's own pieces: big buttons, full-screen sheets, switches, fields and toasts above the tab bar.
import { X, type LucideIcon } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

type Kind = 'primary' | 'danger' | 'plain'
const LOOK: Record<Kind, string> = {
  primary: 'bg-accent text-white active:brightness-90',
  danger: 'bg-bad-bg text-bad active:brightness-95',
  plain: 'bg-pill active:bg-selected',
}

export function Button({ kind = 'plain', icon: Icon, className = '', children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; icon?: LucideIcon }) {
  return (
    <button {...props} className={`flex h-12 items-center justify-center gap-2 rounded-xl px-4 font-bold
      disabled:opacity-50 ${LOOK[kind]} ${className}`}>
      {Icon && <Icon size={20} />}{children}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-2xl bg-card p-4 shadow-[var(--shadow-card)] ${className}`}>{children}</section>
}

/** A screen over everything (a phone's dialog): title, close, content that scrolls, actions at the bottom. */
export function Sheet({ title, onClose, children, actions }:
  { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="safe fixed inset-0 z-40 flex flex-col bg-window">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2">
        <button aria-label="Close" onClick={onClose} className="grid size-12 place-items-center rounded-full
          active:bg-hover"><X size={24} /></button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">{title}</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      {actions && <footer className="flex shrink-0 gap-3 border-t border-line p-4">{actions}</footer>}
    </div>
  )
}

export function Switch({ label, hint, checked, onChange }:
  { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-14 items-center gap-3 py-2">
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block text-sm text-dim">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-pill transition peer-checked:bg-accent
        after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition
        peer-checked:after:translate-x-5" />
    </label>
  )
}

export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block py-2">
      <span className="mb-1 block text-sm font-bold text-dim">{label}</span>
      <input {...props} className="h-12 w-full rounded-xl bg-pill px-4 text-base outline-none
        focus:ring-2 focus:ring-accent" />
    </label>
  )
}

/** One choice of a few, as a row of buttons (scope of jobs, a cluster). */
export function Segments<T extends string>({ value, options, onChange }:
  { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl bg-pill p-1">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)} className={`h-10 min-w-0 flex-1 shrink-0 truncate rounded-lg
          px-3 text-sm font-bold ${v === value ? 'bg-card shadow-[var(--shadow-card)]' : 'text-dim'}`}>{label}</button>
      ))}
    </div>
  )
}

const ToastContext = createContext<(text: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([])
  const toast = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])
  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--bottom)+80px)] z-50 flex flex-col
        items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-2xl bg-[#353538] px-5 py-3 text-center text-white shadow-lg">{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
