import { Loader2, X, type LucideIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

type Kind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
// suggested and flat: older names for primary and ghost
type ButtonKind = Kind | 'suggested' | 'flat'
type ButtonSize = 'sm' | 'md' | 'lg'

const KIND: Record<ButtonKind, Kind> = {
  primary: 'primary', secondary: 'secondary', ghost: 'ghost', danger: 'danger', 'danger-solid': 'danger-solid',
  suggested: 'primary', flat: 'ghost',
}
const LOOK: Record<Kind, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-40',
  secondary: 'border border-line-strong text-text hover:bg-hover active:bg-pressed disabled:opacity-45',
  ghost: 'text-text hover:bg-hover active:bg-pressed disabled:opacity-45',
  danger: 'border border-line-strong text-bad hover:bg-bad-bg active:bg-bad-bg disabled:opacity-45',
  'danger-solid': 'bg-bad-fill text-white hover:brightness-95 active:brightness-90 disabled:opacity-45',
}
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 gap-1.5 rounded-md px-3 text-sm',
  md: 'h-9 gap-2 rounded-lg px-3.5 text-base',
  lg: 'h-11 gap-2 rounded-lg px-5 text-base',
}

/** pill: the big call to action of the first start. */
export function Button({ kind = 'secondary', size = 'md', pill = false, className = '', ...props }:
  { kind?: ButtonKind; size?: ButtonSize; pill?: boolean }
  & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const shape = pill ? 'h-11 gap-2 rounded-lg px-6 text-md' : SIZE[size]
  return (
    <button {...props}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold transition-colors
        duration-90 ${shape} ${LOOK[KIND[kind]]} ${className}`} />
  )
}

/** size is the icon's; small makes the button 28px instead of 36px. */
export function IconButton({ icon: Icon, label, onClick, size = 16, small = false, disabled, className = '' }:
  { icon: LucideIcon; label: string; onClick?: () => void; size?: number; small?: boolean; disabled?: boolean
    className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`grid shrink-0 place-items-center rounded-md text-dim transition-colors duration-90 hover:bg-hover
        hover:text-text active:bg-pressed disabled:opacity-45 ${small ? 'size-7' : 'size-9'} ${className}`}>
      <Icon size={size} />
    </button>
  )
}

type Status = 'success' | 'info' | 'warning' | 'danger' | 'neutral'
// ok, warn, bad and dim: older names
type PillKind = Status | 'ok' | 'warn' | 'bad' | 'dim'

const PILL_KIND: Record<PillKind, Status> = {
  success: 'success', info: 'info', warning: 'warning', danger: 'danger', neutral: 'neutral',
  ok: 'success', warn: 'warning', bad: 'danger', dim: 'neutral',
}
const PILL: Record<Status, { box: string; dot: string }> = {
  success: { box: 'text-text', dot: 'bg-text' },
  info: { box: 'text-text', dot: 'bg-dim animate-pulse' },
  warning: { box: 'text-text', dot: 'bg-dim' },
  danger: { box: 'text-bad', dot: 'bg-bad' },
  neutral: { box: 'text-dim', dot: 'border-[1.5px] border-dim' },
}

/** For session states ("Connected", "Approve Duo on your phone") and Slurm job states ("RUNNING"). */
export function statusKind(state: string): Status {
  const s = state.toLowerCase()
  if (/^(connected|running|done|ready|succeeded|active)\b/.test(s)) return 'success'
  if (/duo|pending|waiting|queued|held|suspended|requeued/.test(s)) return 'warning'
  if (/error|fail|timeout|timed out|out_of_memory|node_fail|boot_fail|deadline|preempted|lost/.test(s)) return 'danger'
  if (/connecting|signing|vpn|requesting|transferring|configuring|completing|starting|copying|sending|resizing/
    .test(s)) return 'info'
  return 'neutral'
}

export function Pill({ kind = 'neutral', dot = true, children, title }:
  { kind?: PillKind; dot?: boolean; children: ReactNode; title?: string }) {
  const look = PILL[PILL_KIND[kind]]
  return (
    <span title={title} className={`inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap text-sm font-medium
      ${look.box}`}>
      {dot && <span aria-hidden className={`size-2 shrink-0 rounded-full ${look.dot}`} />}
      {children}
    </span>
  )
}

export function StatusPill({ state, children }: { state: string; children?: ReactNode }) {
  return <Pill kind={statusKind(state)}>{children ?? state}</Pill>
}

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-dim" />
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />
}

export function SkeletonRows({ rows = 5, height = 40 }: { rows?: number; height?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ height }} className="flex items-center gap-3 border-b border-line px-4">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-16" />
        </div>
      ))}
    </div>
  )
}

export function Meter({ value, label, className = '' }: { value: number; label?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const color = v >= 1 ? 'bg-bad-dot' : 'bg-text'
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}
      className={`h-1.5 overflow-hidden rounded-full bg-pill ${className}`}>
      <div className={`h-full rounded-full transition-[width] duration-220 ${color}`} style={{ width: `${v * 100}%` }} />
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action, secondary }:
  { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <Icon size={28} className="mb-1 text-dim" />
      <h2 className="text-md font-semibold">{title}</h2>
      {text && <p className="max-w-[44ch] text-base text-dim">{text}</p>}
      {(action || secondary) && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {action}{secondary}</div>}
    </div>
  )
}

/** stop: keeps the click from reaching a clickable row around it. */
export function Switch({ on, onChange, label, stop = false, disabled }:
  { on: boolean; onChange: (on: boolean) => void; label?: string; stop?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={(e) => { if (stop) e.stopPropagation(); onChange(!on) }}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-45 ${
        on ? 'bg-accent' : 'bg-line-strong'}`}>
      <span className={`absolute top-1 left-1 size-4 rounded-full transition-transform duration-150 ease-enter ${
        on ? 'translate-x-4 bg-on-accent' : 'bg-window'}`} />
    </button>
  )
}

export const FIELD = 'h-9 rounded-lg border border-line-strong bg-window px-3 text-base text-text outline-none '
  + 'placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent disabled:opacity-45'

// newest last: Escape closes only the top one
const open: symbol[] = []

export function useEscape(onClose: () => void) {
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
}

export function Dialog({ title, onClose, children, actions, width = 480, height, bare = false }:
  { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; width?: number; height?: number
    bare?: boolean  // the children lay out and scroll the body themselves
  }) {
  useEscape(onClose)
  return (
    <div className="dialog-scrim fixed inset-0 z-40 grid place-items-center bg-scrim p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        style={{ width, height }}
        className="dialog-in flex max-h-[90vh] max-w-full flex-col rounded-xl bg-window shadow-[var(--shadow-dialog)]">
        <div className="flex h-14 shrink-0 items-center gap-2 pr-2 pl-5">
          <h2 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" size={18} onClick={onClose} />
        </div>
        <div className={bare ? 'flex min-h-0 flex-1 border-t border-line' : 'overflow-auto px-5 pb-4'}>{children}</div>
        {actions && <div className="flex items-center justify-end gap-2 px-5 pt-3 pb-5">
          {actions}</div>}
      </div>
    </div>
  )
}

export function AlertDialog({ title, children, keep, act, danger = true, disabled, onAct, onClose }: {
  title: string; children?: ReactNode; keep: string; act: string; danger?: boolean; disabled?: boolean
  onAct: () => void; onClose: () => void
}) {
  useEscape(onClose)
  return (
    <div className="dialog-scrim fixed inset-0 z-40 grid place-items-center bg-scrim p-4" onMouseDown={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="alert-title" onMouseDown={(e) => e.stopPropagation()}
        className="dialog-in w-[420px] max-w-full rounded-xl bg-window p-5 shadow-[var(--shadow-dialog)]">
        <h2 id="alert-title" className="text-lg font-semibold">{title}</h2>
        {children && <div className="mt-2 flex flex-col gap-2 text-base text-dim">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button autoFocus onClick={onClose}>{keep}</Button>
          <Button kind={danger ? 'danger-solid' : 'primary'} onClick={onAct} disabled={disabled}>{act}</Button>
        </div>
      </div>
    </div>
  )
}

export function List({ children }: { children: ReactNode }) {
  return <section className="divide-y divide-line overflow-hidden border-y border-line">{children}</section>
}

export function Row({ title, subtitle, prefix, suffix, onClick }:
  { title: ReactNode; subtitle?: ReactNode; prefix?: ReactNode; suffix?: ReactNode; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={`flex min-h-12 items-center gap-3 px-4 py-2 ${
      onClick ? 'transition-colors duration-90 hover:bg-hover active:bg-pressed' : ''}`}>
      {prefix}
      <div className="min-w-0 flex-1">
        <div className="truncate">{title}</div>
        {subtitle && <div className="truncate text-sm text-dim">{subtitle}</div>}
      </div>
      {suffix}
    </div>
  )
}

export function IconTile({ icon: Icon, size = 40, tone = 'neutral' }:
  { icon: LucideIcon; size?: 40 | 56; tone?: 'neutral' | 'accent' | 'success' }) {
  const look = tone !== 'neutral' ? 'text-text' : 'text-dim'
  return (
    <div className={`grid shrink-0 place-items-center rounded-lg border border-line ${size === 56 ? 'size-14' : 'size-10'}
      ${look}`}>
      <Icon size={size === 56 ? 24 : 20} />
    </div>
  )
}
