// Shared building blocks, so every page looks the same (Adwaita-like; see index.css for the colors).
import { Loader2, X, type LucideIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-card shadow-[var(--shadow-card)] ${className}`}>{children}</section>
}

type ButtonKind = 'suggested' | 'destructive' | 'pill' | 'flat'
const BUTTON: Record<ButtonKind, string> = {
  suggested: 'bg-accent text-white hover:brightness-110',
  destructive: 'bg-bad-bg text-bad hover:brightness-110',
  pill: 'bg-pill hover:bg-selected',
  flat: 'hover:bg-hover',
}

export function Button({ kind = 'pill', round = false, className = '', ...props }:
  { kind?: ButtonKind; round?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...props}
      className={`inline-flex items-center justify-center gap-2 font-bold transition disabled:opacity-50 ${
        round ? 'h-[42px] rounded-full px-6' : 'h-9 rounded-md px-3'} ${BUTTON[kind]} ${className}`} />
  )
}

export function IconButton({ icon: Icon, label, onClick, size = 18 }:
  { icon: LucideIcon; label: string; onClick?: () => void; size?: number }) {
  return (
    <button aria-label={label} title={label} onClick={onClick}
      className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-hover">
      <Icon size={size} />
    </button>
  )
}

type PillKind = 'ok' | 'bad' | 'warn' | 'dim'
const PILL: Record<PillKind, string> = {
  ok: 'bg-ok-bg text-ok', bad: 'bg-bad-bg text-bad', warn: 'bg-warn-bg text-warn', dim: 'bg-pill text-dim',
}

export function Pill({ kind = 'dim', children }: { kind?: PillKind; children: ReactNode }) {
  return <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-bold ${PILL[kind]}`}>
    {children}</span>
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-dim" />
}

/** A whole page with nothing to show: not connected, empty folder, error. */
export function EmptyState({ icon: Icon, title, text, action }:
  { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Icon size={64} strokeWidth={1.25} className="text-dim" />
      <h2 className="text-2xl font-bold">{title}</h2>
      {text && <p className="max-w-md text-dim">{text}</p>}
      {action}
    </div>
  )
}

// Open dialogs, newest last: Escape closes only the top one
const open: symbol[] = []

/** A dialog over the window. Escape or the X closes it. */
export function Dialog({ title, onClose, children, actions, width = 480 }:
  { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; width?: number }) {
  useEffect(() => {
    const me = Symbol('dialog')
    open.push(me)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && open[open.length - 1] === me && onClose()
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
      open.splice(open.indexOf(me), 1)
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width }}
        className="flex max-h-[90vh] max-w-full flex-col rounded-2xl bg-window shadow-2xl">
        <div className="flex h-12 shrink-0 items-center px-2">
          <div className="w-9" />
          <h2 className="flex-1 text-center text-[15px] font-bold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} size={16} />
        </div>
        <div className="overflow-auto px-6 pb-4">{children}</div>
        {actions && <div className="flex justify-end gap-2 border-t border-line px-6 pb-5 pt-4">{actions}</div>}
      </div>
    </div>
  )
}

/** A short question with two answers (Adwaita's alert dialog): the safe answer has focus, the risky one is red on
 * the right. Esc or a click outside is the safe answer. */
export function AlertDialog({ title, children, keep, act, danger = true, disabled, onAct, onClose }: {
  title: string; children?: ReactNode; keep: string; act: string; danger?: boolean; disabled?: boolean
  onAct: () => void; onClose: () => void
}) {
  useEffect(() => {
    const me = Symbol('dialog')
    open.push(me)
    const key = (e: KeyboardEvent) => e.key === 'Escape' && open[open.length - 1] === me && onClose()
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('keydown', key)
      open.splice(open.indexOf(me), 1)
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 p-4" onMouseDown={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="alert-title" onMouseDown={(e) => e.stopPropagation()}
        className="w-[400px] max-w-full rounded-2xl bg-window p-6 shadow-2xl ring-1 ring-line">
        <h2 id="alert-title" className="text-xl font-bold leading-snug">{title}</h2>
        {children && <div className="mt-2 flex flex-col gap-2 text-[15px] text-dim">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button autoFocus onClick={onClose}>{keep}</Button>
          <Button onClick={onAct} disabled={disabled}
            className={danger ? '!bg-[#c01c28] !text-white hover:brightness-110' : '!bg-accent !text-white'}>
            {act}</Button>
        </div>
      </div>
    </div>
  )
}

/** A list in a card, rows separated by lines (Adwaita's boxed list). */
export function List({ children }: { children: ReactNode }) {
  return <Card className="divide-y divide-line overflow-hidden">{children}</Card>
}

export function Row({ title, subtitle, prefix, suffix, onClick }:
  { title: ReactNode; subtitle?: ReactNode; prefix?: ReactNode; suffix?: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`flex min-h-[56px] items-center gap-3 px-4 py-2 ${onClick ? 'hover:bg-hover' : ''}`}>
      {prefix}
      <div className="min-w-0 flex-1">
        <div className="truncate">{title}</div>
        {subtitle && <div className="truncate text-[13px] text-dim">{subtitle}</div>}
      </div>
      {suffix}
    </div>
  )
}
