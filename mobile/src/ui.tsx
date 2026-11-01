// The phone's own pieces: big buttons, full-screen sheets, switches, fields, lists, pickers and toasts above the
// tab bar. Every sheet takes part in Android's Back (nav.tsx useBackLayer). Touch targets are at least 44 px.
import { Check, ChevronRight, Search, X, type LucideIcon } from 'lucide-react'
import {
  createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'

import { useBackLayer } from './nav'

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
  useBackLayer(onClose)
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

/** One row of a list: icon, title, a line under it, and a chevron when it opens something. */
export function ListRow({ icon: Icon, title, subtitle, trailing, onClick, danger = false }: {
  icon?: LucideIcon; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; onClick?: () => void
  danger?: boolean
}) {
  const body = (
    <>
      {Icon && <Icon size={22} className={danger ? 'text-bad' : 'text-dim'} />}
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${danger ? 'text-bad' : ''}`}>{title}</span>
        {subtitle && <span className="block truncate text-sm text-dim">{subtitle}</span>}
      </span>
      {trailing}
      {onClick && !trailing && <ChevronRight size={20} className="text-dim" />}
    </>
  )
  const cls = 'flex min-h-14 w-full items-center gap-3 py-2 text-left'
  return onClick
    ? <button onClick={onClick} className={`${cls} active:bg-hover`}>{body}</button>
    : <div className={cls}>{body}</div>
}

/** A panel from the bottom, over a dimmed screen: closes on the dimmed part or Back. */
function BottomSheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useBackLayer(onClose)
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-scrim" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="max-h-[85%] overflow-y-auto rounded-t-2xl bg-raised px-4 pt-2 pb-[calc(var(--bottom)+16px)]
          shadow-[var(--shadow-dialog)]">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line-strong" />
        {title && <p className="px-1 pb-2 text-sm font-semibold text-dim">{title}</p>}
        {children}
      </div>
    </div>
  )
}

export type SheetAction = { label: string; icon?: LucideIcon; danger?: boolean; onPick: () => void }

/** What a long-press offers: a list of actions, Cancel at the bottom. */
export function ActionSheet({ title, actions, onClose }:
  { title?: string; actions: SheetAction[]; onClose: () => void }) {
  return (
    <BottomSheet title={title} onClose={onClose}>
      {actions.map((a) => (
        <ListRow key={a.label} icon={a.icon} title={a.label} danger={a.danger}
          onClick={() => { onClose(); a.onPick() }} trailing={<span />} />
      ))}
      <Button className="mt-2 w-full" onClick={onClose}>Cancel</Button>
    </BottomSheet>
  )
}

/** Are you sure: what happens, then the safe choice and the action. */
export function ConfirmSheet({ title, text, confirm, danger = false, onConfirm, onClose }: {
  title: string; text?: ReactNode; confirm: string; danger?: boolean; onConfirm: () => void; onClose: () => void
}) {
  return (
    <BottomSheet onClose={onClose}>
      <h2 className="px-1 text-lg font-bold">{title}</h2>
      {text && <p className="px-1 pt-1 text-dim">{text}</p>}
      <div className="mt-4 flex gap-3">
        <Button className="flex-1" onClick={onClose}>Cancel</Button>
        <Button kind={danger ? 'danger' : 'primary'} className="flex-1"
          onClick={() => { onClose(); onConfirm() }}>{confirm}</Button>
      </div>
    </BottomSheet>
  )
}

export type PickerOption<T extends string> = { value: T; label: string; hint?: string }

/** Pick one of many (a partition, an account, a cluster): a list with a check on the current one. */
export function PickerSheet<T extends string>({ title, options, value, onPick, onClose }: {
  title: string; options: PickerOption<T>[]; value?: T; onPick: (v: T) => void; onClose: () => void
}) {
  return (
    <BottomSheet title={title} onClose={onClose}>
      {options.map((o) => (
        <ListRow key={o.value} title={o.label} subtitle={o.hint}
          trailing={o.value === value ? <Check size={20} className="text-accent-text" /> : <span className="w-5" />}
          onClick={() => { onClose(); onPick(o.value) }} />
      ))}
    </BottomSheet>
  )
}

export function TextArea({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block py-2">
      <span className="mb-1 block text-sm font-bold text-dim">{label}</span>
      <textarea {...props} className="min-h-28 w-full rounded-xl bg-pill p-4 text-base outline-none
        focus:ring-2 focus:ring-accent" />
    </label>
  )
}

export function SearchField({ value, onChange, placeholder = 'Search' }:
  { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex h-12 items-center gap-2 rounded-xl bg-pill px-4">
      <Search size={20} className="shrink-0 text-dim" />
      <input type="search" value={value} placeholder={placeholder} aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-base outline-none" />
      {value && <button aria-label="Clear" onClick={() => onChange('')}
        className="-mr-2 grid size-11 place-items-center rounded-full text-dim active:bg-hover"><X size={18} /></button>}
    </label>
  )
}

/** Filters as a row of chips; several can be on (state filters), or exactly one when one is set. */
export function Chips<T extends string>({ options, value, onChange, one = false }: {
  options: readonly (readonly [T, string])[]; value: T[]; onChange: (v: T[]) => void; one?: boolean
}) {
  const flip = (v: T) => onChange(one ? [v] : value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {options.map(([v, label]) => {
        const on = value.includes(v)
        return (
          <button key={v} onClick={() => flip(v)} aria-pressed={on}
            className={`h-11 shrink-0 rounded-full px-4 text-sm font-semibold ${
              on ? 'bg-accent text-white' : 'bg-pill text-dim active:bg-selected'}`}>{label}</button>
        )
      })}
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
