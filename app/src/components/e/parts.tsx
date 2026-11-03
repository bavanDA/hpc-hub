// More style E pieces at desktop size, the twins of the phone's (mobile/src/ui.tsx): buttons, a status dot, the
// "are you sure" window and a pick-one list.
import { type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { EDialog, List, Row, Tick } from './ui'

type Kind = 'primary' | 'plain' | 'danger' | 'quiet'
const LOOK: Record<Kind, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-pressed',
  danger: 'bg-bad-fill text-white hover:brightness-95 active:brightness-90',  // destructive: always solid red
  plain: 'border border-line-strong hover:bg-hover active:bg-pressed',
  quiet: 'hover:bg-hover active:bg-pressed',
}

/** A button. One "primary" per window or page (the main action); the rest are plain. */
export function Button({ kind = 'plain', icon: Icon, className = '', children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; icon?: LucideIcon }) {
  return (
    <button type="button" {...props} className={`flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg px-4
      text-center leading-tight font-semibold whitespace-nowrap disabled:opacity-40 ${LOOK[kind]} ${className}`}>
      {Icon && <Icon size={16} className="shrink-0" />}{children}
    </button>
  )
}

export type Tone = 'on' | 'busy' | 'off' | 'error'

/** A small status dot: solid when on, breathing while something happens, hollow when off, red on an error. */
export function StatusDot({ tone }: { tone: Tone }) {
  const look = { on: 'bg-ok-dot', busy: 'bg-dim animate-pulse', off: 'border-[1.5px] border-dim', error: 'bg-bad' }[tone]
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${look}`} />
}

/** Are you sure: what happens, then two buttons that say what they do. keep is the safe one ("Keep it", "Stay
 *  connected"), never a bare Cancel; a danger confirm is solid red. */
export function ConfirmDialog({ title, text, keep, confirm, danger = false, onConfirm, onClose }: {
  title: string; text?: ReactNode; keep: string; confirm: string; danger?: boolean; onConfirm: () => void
  onClose: () => void
}) {
  return (
    <EDialog title={title} width={440} onClose={onClose} actions={<>
      <Button autoFocus className="flex-1" onClick={onClose}>{keep}</Button>
      <Button kind={danger ? 'danger' : 'primary'} className="flex-1"
        onClick={() => { onClose(); onConfirm() }}>{confirm}</Button>
    </>}>
      {text && <div className="flex flex-col gap-2 px-5 pb-2 text-dim">{text}</div>}
    </EDialog>
  )
}

export type PickerOption<T extends string> = { value: T; label: string; hint?: string }

/** Pick one of many (a protocol, an agent's model): rows with a check on the current one. */
export function PickerDialog<T extends string>({ title, options, value, onPick, onClose }: {
  title: string; options: PickerOption<T>[]; value?: T; onPick: (v: T) => void; onClose: () => void
}) {
  return (
    <EDialog title={title} width={420} onClose={onClose}>
      <List>
        {options.map((o) => (
          <Row key={o.value} label={o.label} sub={o.hint} onPress={() => { onClose(); onPick(o.value) }}>
            <Tick on={o.value === value} /></Row>
        ))}
      </List>
    </EDialog>
  )
}

/** A line over a window's rows: what went wrong (error), or what to do first. */
export function Note({ error = false, children }: { error?: boolean; children: ReactNode }) {
  return <p role={error ? 'alert' : undefined} className={`px-5 pb-3 break-words ${error ? 'font-semibold text-bad'
    : 'font-semibold'}`}>{children}</p>
}
