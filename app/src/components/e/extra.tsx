import { Check, CircleAlert, Search, X, type LucideIcon } from 'lucide-react'
import { useState, type ButtonHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'

import { useEscape } from '../ui'
import { EDialog, Row, Tick } from './ui'

type Kind = 'primary' | 'plain' | 'danger' | 'quiet'
const LOOK: Record<Kind, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed',
  plain: 'border border-line-strong hover:bg-hover active:bg-pressed',
  danger: 'bg-bad-fill text-white hover:brightness-95 active:brightness-90',  // destructive: always solid red
  quiet: 'hover:bg-hover active:bg-pressed',
}

export function EButton({ kind = 'plain', small = false, icon: Icon, className = '', children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; small?: boolean; icon?: LucideIcon }) {
  return (
    <button type="button" {...props} className={`flex shrink-0 items-center justify-center gap-2 rounded-lg
      text-center leading-tight font-semibold whitespace-nowrap disabled:opacity-40 ${small ? 'h-8 px-3 text-sm'
      : 'h-10 px-4'} ${LOOK[kind]} ${className}`}>
      {Icon && <Icon size={small ? 14 : 16} className="shrink-0" />}{children}
    </button>
  )
}

export function IconBtn({ icon: Icon, label, onClick, disabled }:
  { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button aria-label={label} title={label} onClick={onClick} disabled={disabled}
      className="grid size-9 shrink-0 place-items-center rounded-md text-dim hover:bg-hover hover:text-text
        active:bg-pressed disabled:opacity-40"><Icon size={17} /></button>
  )
}

/** onPress makes the name part a button; trailing holds the row's own buttons, outside it. */
export function ItemRow({ icon: Icon, label, sub, title, onPress, trailing }: {
  icon?: LucideIcon; label: ReactNode; sub?: ReactNode; title?: string; onPress?: () => void; trailing?: ReactNode
}) {
  const body = (
    <>
      {Icon && <Icon size={20} className="shrink-0 text-dim" />}
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
    </>
  )
  const main = 'flex min-h-12 min-w-0 flex-1 items-center gap-3 py-2 pl-5 text-left'
  return (
    <div title={title} className="flex items-center border-b border-line">
      {onPress
        ? <button onClick={onPress} className={`${main} ${trailing ? 'pr-3' : 'pr-5'} hover:bg-hover active:bg-pressed`}>
            {body}</button>
        : <div className={`${main} ${trailing ? 'pr-3' : 'pr-5'}`}>{body}</div>}
      {trailing && <div className="flex shrink-0 items-center gap-1 pr-3">{trailing}</div>}
    </div>
  )
}

export function IconToggleRow({ icon: Icon, label, sub, checked, onChange, disabled }: {
  icon?: LucideIcon; label: string; sub?: ReactNode; checked: boolean; onChange: (on: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className={`flex min-h-12 w-full items-center gap-3 border-b border-line px-5 py-2 text-left
      ${disabled ? 'opacity-60' : 'hover:bg-hover'}`}>
      {Icon && <Icon size={20} className="shrink-0 text-dim" />}
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </label>
  )
}

export function CheckRow({ label, value, checked, onChange }:
  { label: ReactNode; value?: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button role="checkbox" aria-checked={checked} onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center gap-3 border-b border-line px-5 py-2 text-left hover:bg-hover
        active:bg-pressed">
      <span className={`grid size-5 shrink-0 place-items-center rounded-[5px] border-[1.5px] ${checked
        ? 'border-accent bg-accent text-on-accent' : 'border-line-strong'}`}>{checked && <Check size={14} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1 break-all">{label}</span>
      {value !== undefined && <span className="shrink-0 font-medium tabular-nums">{value}</span>}
    </button>
  )
}

export function Switch({ checked, onChange, label, disabled }:
  { checked: boolean; onChange: (on: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <span className="relative inline-flex shrink-0">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} disabled={disabled}
        onChange={(e) => onChange(e.target.checked)} className="peer absolute inset-0 cursor-pointer opacity-0" />
      <span className="pointer-events-none relative h-6 w-10 rounded-full bg-line-strong transition-colors
        peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2
        peer-focus-visible:outline-focus after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full
        after:bg-window after:transition peer-checked:after:translate-x-4 peer-checked:after:bg-on-accent" />
    </span>
  )
}

export function Confirm({ title, children, keep, act, danger = true, disabled, onAct, onClose }: {
  title: string; children?: ReactNode; keep: string; act: string; danger?: boolean; disabled?: boolean
  onAct: () => void; onClose: () => void
}) {
  useEscape(onClose)
  return (
    <div className="style-e dialog-scrim fixed inset-0 z-50 grid place-items-center bg-scrim p-4" onMouseDown={onClose}>
      <div role="alertdialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className="dialog-in w-[420px] max-w-full rounded-xl bg-window p-5 shadow-[var(--shadow-dialog)]">
        <h2 className="text-lg font-semibold">{title}</h2>
        {children && <div className="mt-1.5 flex flex-col gap-2 text-dim">{children}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <EButton autoFocus onClick={onClose}>{keep}</EButton>
          <EButton kind={danger ? 'danger' : 'primary'} disabled={disabled} onClick={onAct}>{act}</EButton>
        </div>
      </div>
    </div>
  )
}

export type Choice<T extends string> = { value: T; label: string; hint?: string }

export function PickDialog<T extends string>({ title, options, value, onPick, onClose }:
  { title: string; options: Choice<T>[]; value?: T; onPick: (v: T) => void; onClose: () => void }) {
  return (
    <EDialog title={title} width={420} onClose={onClose}>
      <div className="border-t border-line">
        {options.map((o) => (
          <Row key={o.value} label={o.label} sub={o.hint} onPress={() => { onClose(); onPick(o.value) }}>
            <Tick on={o.value === value} /></Row>
        ))}
      </div>
    </EDialog>
  )
}

export function ChoiceRow<T extends string>({ label, sub, value, options, onChange }:
  { label: string; sub?: ReactNode; value: T; options: Choice<T>[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Row label={label} sub={sub} value={options.find((o) => o.value === value)?.label ?? 'Default'} opens
        onPress={() => setOpen(true)} />
      {open && <PickDialog title={label} options={options} value={value} onPick={onChange}
        onClose={() => setOpen(false)} />}
    </>
  )
}

const BOX = 'w-full rounded-lg border border-line-strong bg-window px-3 outline-none placeholder:text-faint '
  + 'focus:border-accent focus:ring-1 focus:ring-accent'

export function TextArea({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block py-1.5">
      <span className="mb-1.5 block text-sm text-dim">{label}</span>
      <textarea spellCheck={false} rows={4} {...props} className={`${BOX} block min-h-20 resize-y py-2.5`} />
    </label>
  )
}

export function SearchField({ value, onChange, placeholder = 'Search', autoFocus }:
  { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
  return (
    <label className="flex h-10 items-center gap-2 rounded-lg bg-soft px-3">
      <Search size={16} className="shrink-0 text-dim" />
      <input value={value} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)} spellCheck={false}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" />
      {value && <button aria-label="Clear" onClick={() => onChange('')}
        className="-mr-1.5 grid size-7 place-items-center rounded-md text-dim hover:bg-hover"><X size={15} /></button>}
    </label>
  )
}

export function Chips<T extends string>({ options, value, onChange, label }:
  { options: readonly (readonly [T, string])[]; value: T[]; onChange: (v: T[]) => void; label?: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map(([v, text]) => {
        const on = value.includes(v)
        return (
          <button key={v} aria-pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== v) : [...value, v])}
            className={`flex h-8 items-center rounded-full border px-3 text-sm font-medium ${on
              ? 'border-accent bg-accent text-on-accent' : 'border-line-strong text-dim hover:bg-hover'}`}>{text}</button>
        )
      })}
    </div>
  )
}

export type Tone = 'on' | 'connected' | 'busy' | 'off' | 'error'

/** Solid when on (green when connected), breathing while busy, hollow when off, red on an error. */
export function StatusDot({ tone }: { tone: Tone }) {
  const look = { on: 'bg-text', connected: 'bg-ok-dot', busy: 'bg-dim animate-pulse', off: 'border-[1.5px] border-dim',
    error: 'bg-bad' }[tone]
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${look}`} />
}

export function Note({ bad = false, children, action }: { bad?: boolean; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`flex items-start gap-2 px-5 pt-3 ${bad ? 'text-bad' : 'text-dim'}`}>
      <CircleAlert size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}{action && <div className="mt-2">{action}</div>}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, text, action }:
  { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-16 text-center">
      <Icon size={28} className="mb-1 text-dim" />
      <h2 className="text-md font-semibold">{title}</h2>
      {text && <p className="max-w-[44ch] text-dim">{text}</p>}
      {action && <div className="mt-3 flex gap-2">{action}</div>}
    </div>
  )
}

export function EPage({ note, actions, width = 760, children }:
  { note?: ReactNode; actions?: ReactNode; width?: number; children: ReactNode }) {
  return (
    <div style={{ maxWidth: width }} className="mx-auto flex flex-col pt-5 pb-10">
      {(note || actions) && (
        <div className="flex min-h-10 items-center gap-2 px-5 pb-4">
          <div className="min-w-0 flex-1 text-dim">{note}</div>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}
