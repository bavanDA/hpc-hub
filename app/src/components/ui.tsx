// Shared building blocks, so every page looks the same. The tokens (colors, type scale, shadows, motion) are in
// index.css; this file is the only place that turns them into buttons, pills, dialogs and empty states.
import { Loader2, X, type LucideIcon } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-card shadow-[var(--shadow-card)] ${className}`}>{children}</section>
}

// -- buttons ---------------------------------------------------------------------------------------------------

/** primary: the one main action of a view. secondary: everything else that matters. ghost: quiet (toolbars, Cancel
 * in a dialog). danger: a soft red for a risky choice in a list. danger-solid: the confirm button of a destructive
 * question. The old names still work: suggested = primary, pill = secondary, flat = ghost, destructive = danger. */
export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
  | 'suggested' | 'pill' | 'flat' | 'destructive'
export type ButtonSize = 'sm' | 'md' | 'lg'

const KIND: Record<ButtonKind, ButtonKind> = {
  primary: 'primary', secondary: 'secondary', ghost: 'ghost', danger: 'danger', 'danger-solid': 'danger-solid',
  suggested: 'primary', pill: 'secondary', flat: 'ghost', destructive: 'danger',
}
const LOOK: Record<string, string> = {
  primary: 'bg-accent text-white hover:bg-accent-hover active:bg-accent-pressed '
    + 'disabled:bg-control disabled:text-faint',
  secondary: 'bg-control text-text hover:bg-pressed active:bg-pressed disabled:opacity-45',
  ghost: 'text-text hover:bg-hover active:bg-pressed disabled:opacity-45',
  danger: 'bg-bad-bg text-bad hover:bg-bad/20 active:bg-bad/25 disabled:opacity-45',
  'danger-solid': 'bg-bad-fill text-white hover:brightness-95 active:brightness-90 disabled:opacity-45',
}
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 rounded-md px-2.5 text-sm',
  md: 'h-[34px] gap-2 rounded-md px-3 text-base',
  lg: 'h-10 gap-2 rounded-md px-4 text-md',
}

/** pill: the rounded call to action of the first-start steps only. `round` is the old name for it. */
export function Button({ kind = 'secondary', size = 'md', pill = false, round = false, className = '', ...props }:
  { kind?: ButtonKind; size?: ButtonSize; pill?: boolean; round?: boolean }
  & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const shape = pill || round ? 'h-10 gap-2 rounded-full px-6 text-md' : SIZE[size]
  return (
    <button {...props}
      className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold transition-colors
        duration-90 ${shape} ${LOOK[KIND[kind]]} ${className}`} />
  )
}

/** A button with only an icon: for well-known glyphs (settings, refresh, close, more, search), always with a label
 * for the tooltip and screen readers. size is the icon's; small makes the button 28px instead of 34px. */
export function IconButton({ icon: Icon, label, onClick, size = 16, small = false, disabled, className = '' }:
  { icon: LucideIcon; label: string; onClick?: () => void; size?: number; small?: boolean; disabled?: boolean
    className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className={`grid shrink-0 place-items-center rounded-md text-text transition-colors duration-90 hover:bg-hover
        active:bg-pressed disabled:opacity-45 ${small ? 'size-7' : 'size-[34px]'} ${className}`}>
      <Icon size={size} />
    </button>
  )
}

// -- status ----------------------------------------------------------------------------------------------------

/** success: connected, running. info: in progress (connecting, transferring). warning: waiting (pending, Duo).
 * danger: failed. neutral: off or over (disconnected, completed, cancelled). ok, warn, bad and dim are the old names. */
export type PillKind = 'success' | 'info' | 'warning' | 'danger' | 'neutral' | 'ok' | 'warn' | 'bad' | 'dim'

const PILL_KIND: Record<PillKind, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  success: 'success', info: 'info', warning: 'warning', danger: 'danger', neutral: 'neutral',
  ok: 'success', warn: 'warning', bad: 'danger', dim: 'neutral',
}
const PILL: Record<string, { box: string; dot: string }> = {
  success: { box: 'bg-ok-bg text-ok', dot: 'bg-ok-dot' },
  info: { box: 'bg-accent-soft text-accent-text', dot: 'bg-accent dot-pulse' },
  warning: { box: 'bg-warn-bg text-warn', dot: 'bg-warn-dot' },
  danger: { box: 'bg-bad-bg text-bad', dot: 'bg-bad-dot' },
  neutral: { box: 'bg-pill text-dim', dot: 'border-[1.5px] border-current' },
}

/** Which kind a state is, for sessions ("Connected", "Approve Duo on your phone") and Slurm jobs ("RUNNING"). */
export function statusKind(state: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
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
    <span title={title} className={`inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2
      text-xs font-semibold ${look.box}`}>
      {dot && <span aria-hidden className={`size-1.5 shrink-0 rounded-full text-current ${look.dot}`} />}
      {children}
    </span>
  )
}

/** A pill for a session or job state, its color picked from the state. */
export function StatusPill({ state, children }: { state: string; children?: ReactNode }) {
  return <Pill kind={statusKind(state)}>{children ?? state}</Pill>
}

// -- feedback ----------------------------------------------------------------------------------------------------

export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin text-dim" />
}

/** A grey placeholder in the shape of what is loading. It shows after 300ms, so a quick load never flashes. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`skeleton block ${className}`} />
}

/** Placeholder rows for a list or table that is loading. */
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

/** How full something is (time used, SUs, disk): blue, amber from 85%, red when full. */
export function Meter({ value, label, className = '' }: { value: number; label?: string; className?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
  const color = v >= 1 ? 'bg-bad-dot' : v >= 0.85 ? 'bg-warn-dot' : 'bg-accent'
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)} aria-label={label}
      className={`h-1.5 overflow-hidden rounded-full bg-pill ${className}`}>
      <div className={`h-full rounded-full transition-[width] duration-220 ${color}`} style={{ width: `${v * 100}%` }} />
    </div>
  )
}

/** A whole page with nothing to show (empty, not connected, error): a tile, a title, one sentence, one action. */
export function EmptyState({ icon: Icon, title, text, action, secondary }:
  { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode; secondary?: ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="mb-1 grid size-14 place-items-center rounded-xl bg-pill text-dim">
        <Icon size={24} />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {text && <p className="max-w-[44ch] text-base text-dim">{text}</p>}
      {(action || secondary) && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        {action}{secondary}</div>}
    </div>
  )
}

/** The top of a narrow page (lists, settings): its title, an optional line under it, actions on the right. */
export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-dim">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

// -- controls ----------------------------------------------------------------------------------------------------

/** An on/off switch (Adwaita's). stop: don't let the click reach a clickable row around it. */
export function Switch({ on, onChange, label, stop = false, disabled }:
  { on: boolean; onChange: (on: boolean) => void; label?: string; stop?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled}
      onClick={(e) => { if (stop) e.stopPropagation(); onChange(!on) }}
      className={`relative h-[26px] w-[48px] shrink-0 rounded-full transition-colors duration-150 disabled:opacity-45 ${
        on ? 'bg-accent' : 'bg-line-strong'}`}>
      <span className={`absolute left-[3px] top-[3px] size-5 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_6/0.3)]
        transition-transform duration-150 ease-enter ${on ? 'translate-x-[22px]' : ''}`} />
    </button>
  )
}

/** Shared look of text inputs and selects: a filled field with an inset ring on focus. */
export const FIELD = 'h-[34px] rounded-md bg-control px-3 text-base text-text outline-none placeholder:text-faint '
  + 'transition-shadow duration-90 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus '
  + 'disabled:opacity-45'

// -- dialogs -----------------------------------------------------------------------------------------------------

// Open dialogs, newest last: Escape closes only the top one
const open: symbol[] = []

function useEscape(onClose: () => void) {
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

/** A dialog over the window. Escape or the X closes it. Actions go in the footer: Cancel (ghost) then the primary. */
export function Dialog({ title, onClose, children, actions, width = 480, height, bare = false }:
  { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; width?: number; height?: number
    bare?: boolean }) {
  useEscape(onClose)
  return (
    <div className="dialog-scrim fixed inset-0 z-40 grid place-items-center bg-scrim p-4" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        style={{ width, height }}
        className="dialog-in flex max-h-[90vh] max-w-full flex-col rounded-2xl bg-raised shadow-[var(--shadow-dialog)]">
        <div className="flex h-12 shrink-0 items-center px-2">
          <div className="w-[34px]" />
          <h2 className="flex-1 text-center text-base font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        {/* bare: the children lay out and scroll the body themselves (a dialog with side navigation) */}
        <div className={bare ? 'flex min-h-0 flex-1 border-t border-line' : 'overflow-auto px-6 pb-4'}>{children}</div>
        {actions && <div className="flex items-center justify-end gap-2 border-t border-line px-6 pb-5 pt-4">
          {actions}</div>}
      </div>
    </div>
  )
}

/** A short question with two answers (Adwaita's alert dialog): the safe answer has focus, the risky one is on the
 * right, red when it destroys something. Esc or a click outside is the safe answer. */
export function AlertDialog({ title, children, keep, act, danger = true, disabled, onAct, onClose }: {
  title: string; children?: ReactNode; keep: string; act: string; danger?: boolean; disabled?: boolean
  onAct: () => void; onClose: () => void
}) {
  useEscape(onClose)
  return (
    <div className="dialog-scrim fixed inset-0 z-40 grid place-items-center bg-scrim p-4" onMouseDown={onClose}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="alert-title" onMouseDown={(e) => e.stopPropagation()}
        className="dialog-in w-[420px] max-w-full rounded-2xl bg-raised p-6 shadow-[var(--shadow-dialog)]">
        <h2 id="alert-title" className="text-xl font-semibold">{title}</h2>
        {children && <div className="mt-2 flex flex-col gap-2 text-md text-dim">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button autoFocus onClick={onClose}>{keep}</Button>
          <Button kind={danger ? 'danger-solid' : 'primary'} onClick={onAct} disabled={disabled}>{act}</Button>
        </div>
      </div>
    </div>
  )
}

// -- lists -------------------------------------------------------------------------------------------------------

/** A list in a card, rows separated by lines (Adwaita's boxed list). */
export function List({ children }: { children: ReactNode }) {
  return <Card className="divide-y divide-line overflow-hidden">{children}</Card>
}

/** A row of a boxed list: 48px, or taller with a subtitle. */
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

/** A rounded tile behind an icon (cluster cards, welcome, empty states). */
export function IconTile({ icon: Icon, size = 40, tone = 'neutral' }:
  { icon: LucideIcon; size?: 40 | 56; tone?: 'neutral' | 'accent' | 'success' }) {
  const look = tone === 'accent' ? 'bg-accent-soft text-accent-text' : tone === 'success' ? 'bg-ok-bg text-ok'
    : 'bg-pill text-dim'
  return (
    <div className={`grid shrink-0 place-items-center rounded-lg ${size === 56 ? 'size-14' : 'size-10'} ${look}`}>
      <Icon size={size === 56 ? 24 : 20} />
    </div>
  )
}
