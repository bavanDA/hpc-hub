// The phone's own pieces, in style E (docs/design/style-e/README.md): rows on a plain background with hairlines, the
// label on the left and the value on the right, numbers you type in place, one solid main button. Every sheet takes
// part in Android's Back (nav.tsx useBackLayer). Touch targets are at least 48 px. Text wraps; nothing is cut off.
import { Check, ChevronRight, Search, X, type LucideIcon } from 'lucide-react'
import {
  createContext, useCallback, useContext, useState, type ButtonHTMLAttributes, type ReactNode,
  type TextareaHTMLAttributes,
} from 'react'

import { human } from '@shared/components/clusters/time'
import { useBackLayer } from './nav'

type Kind = 'primary' | 'danger' | 'plain' | 'quiet'
const LOOK: Record<Kind, string> = {
  primary: 'bg-accent text-on-accent active:bg-accent-pressed',
  danger: 'bg-bad-fill text-white active:brightness-90',  // destructive: always solid red, never pale
  plain: 'border border-line-strong active:bg-pressed',
  quiet: 'active:bg-pressed',
}

/** A button. One "primary" per screen (the main action); the rest are plain. */
export function Button({ kind = 'plain', icon: Icon, className = '', children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind; icon?: LucideIcon }) {
  return (
    <button {...props} className={`flex min-h-12 items-center justify-center gap-2 rounded-[10px] px-4 text-center
      leading-tight font-semibold disabled:opacity-40 ${LOOK[kind]} ${className}`}>
      {Icon && <Icon size={20} className="shrink-0" />}{children}
    </button>
  )
}

/** The screen's main action: full width, solid (black on light, white on dark). */
export function MainButton(props: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon }) {
  return <Button kind="primary" {...props} className={`h-[52px] w-full text-base ${props.className ?? ''}`} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-card p-4 ${className}`}>{children}</section>
}

/** A screen over everything (a phone's dialog): close, title, content that scrolls, the actions at the bottom.
 *  flush: the content has no padding, for screens made of rows. */
export function Sheet({ title, onClose, children, actions, flush = false }:
  { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; flush?: boolean }) {
  useBackLayer(onClose)
  return (
    <div className="safe fixed inset-0 z-40 flex flex-col bg-window">
      <header className="flex h-14 shrink-0 items-center gap-1 px-1">
        <button aria-label="Close" onClick={onClose} className="grid size-12 place-items-center rounded-full
          active:bg-pressed"><X size={24} /></button>
        <h1 className="min-w-0 flex-1 text-[17px] leading-tight font-semibold">{title}</h1>
      </header>
      <div className={`min-h-0 flex-1 overflow-y-auto ${flush ? 'pt-2' : 'p-4'}`}>{children}</div>
      {actions && <footer className="flex shrink-0 gap-3 px-4 py-3">{actions}</footer>}
    </div>
  )
}

/** A list of rows: a hairline on top, each row draws the one under it. */
export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border-t border-line ${className}`}>{children}</div>
}

/** A titled group of rows. */
export function Section({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="pt-5">
      {title && <h3 className="px-4 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">{title}</h3>}
      <List>{children}</List>
      {note && <p className="px-4 pt-2 text-sm text-dim">{note}</p>}
    </section>
  )
}

/** One row: label on the left, value on the right. A chevron only when it opens another screen (opens). */
export function Row({ label, sub, value, icon: Icon, opens = false, onPress, danger = false, children }: {
  label: ReactNode; sub?: ReactNode; value?: ReactNode; icon?: LucideIcon; opens?: boolean; onPress?: () => void
  danger?: boolean; children?: ReactNode
}) {
  const body = (
    <>
      {Icon && <Icon size={22} className={`shrink-0 ${danger ? 'text-bad' : 'text-dim'}`} />}
      <span className="min-w-0 flex-1 break-words">
        <span className={`block ${danger ? 'text-bad' : ''}`}>{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
      {value !== undefined && <span className="max-w-[60%] text-right font-medium break-words tabular-nums">
        {value}</span>}
      {children}
      {opens && <ChevronRight size={18} className="-mr-1 shrink-0 text-dim" />}
    </>
  )
  const cls = 'flex min-h-14 w-full items-center gap-3 border-b border-line px-4 py-2 text-left text-base'
  return onPress
    ? <button onClick={onPress} className={`${cls} active:bg-pressed`}>{body}</button>
    : <div className={cls}>{body}</div>
}

/** A number and its unit, the unit smaller and grey: 8 GB. */
export function Amount({ n, unit }: { n: ReactNode; unit?: string }) {
  return <>{n}{unit && <small className="ml-1 text-sm font-normal text-dim">{unit}</small>}</>
}

/** Whether a typed number is allowed. */
export const inRange = (v: number, min: number, max?: number | null) => v >= min && (!max || v <= max)

/** The box you type a number in: big, with its unit inside on the right. */
function NumberBox({ label, value, unit, bad, onChange, autoFocus, inline = false }: {
  label: string; value: string; unit: string; bad: boolean; onChange: (text: string) => void; autoFocus?: boolean
  inline?: boolean  // one of several side by side
}) {
  return (
    <label className={`flex h-[52px] min-w-0 shrink-0 items-center ${inline ? 'grow basis-0' : ''} rounded-lg border-[1.5px] bg-window px-3.5
      ${bad ? 'border-bad' : 'border-accent'}`}>
      <input aria-label={label} aria-invalid={bad} type="text" inputMode="numeric" pattern="[0-9]*"
        enterKeyHint="done" autoFocus={autoFocus} value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={(e) => e.target.select()}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="w-full min-w-0 bg-transparent text-[22px] font-semibold tabular-nums outline-none" />
      <span className="ml-2 shrink-0 text-[15px] text-dim">{unit}</span>
    </label>
  )
}

/** A number row (cores, GB, GPUs). Tap it and it opens in place as a big input with its limit; any whole number
 *  from min to max can be typed. Out of range, the limit turns red and stays under the row; the screen disables its
 *  main button (inRange). */
export function NumberRow({ label, value, unit, showUnit = true, min = 1, max, onChange }: {
  label: string; value: number; unit: string; showUnit?: boolean; min?: number; max?: number | null
  onChange: (n: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const ok = inRange(value, min, max)
  const limit = value < min ? `At least ${min} ${unit}` : max ? `Up to ${max} ${unit}` : ''
  if (draft !== null) {
    return (
      <div className="flex flex-col gap-2 border-b border-line bg-soft px-4 pt-3 pb-3.5"
        onBlur={() => setDraft(null)}>
        <div className="flex justify-between gap-3 text-sm text-dim">
          <span>{label}</span><span className={ok ? '' : 'font-semibold text-bad'}>{limit}</span></div>
        <NumberBox label={label} value={draft} unit={unit} bad={!ok} autoFocus
          onChange={(t) => { setDraft(t); onChange(t ? parseInt(t, 10) : 0) }} />
      </div>
    )
  }
  return (
    <Row label={label} sub={!ok && <span className="font-semibold text-bad">{limit}</span>}
      onPress={() => setDraft(String(value || ''))}
      value={<span className={ok ? '' : 'text-bad'}><Amount n={value} unit={showUnit ? unit : undefined} /></span>} />
  )
}

/** "1 day 4 h 0 min" in row form: numbers strong, units grey. */
function Duration({ total }: { total: number }) {
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60
  return <>{d > 0 && <><Amount n={d} unit={d === 1 ? 'day' : 'days'} />{' '}</>}<Amount n={h} unit="h" />{' '}
    <Amount n={m} unit="min" /></>
}

/** A length of time typed as days, hours and minutes, in place like NumberRow. max: the longest allowed (minutes). */
export function DurationRow({ label, minutes: total, max, onChange }:
  { label: string; minutes: number; max?: number | null; onChange: (m: number) => void }) {
  const [draft, setDraft] = useState<[string, string, string] | null>(null)
  const ok = inRange(total, 1, max)
  const limit = total < 1 ? 'At least 1 min' : max ? `Up to ${human(max)}` : ''
  if (draft !== null) {
    const set = (i: number, t: string) => {
      const next = [...draft] as [string, string, string]
      next[i] = t
      setDraft(next)
      const [d, h, m] = next.map((x) => parseInt(x || '0', 10))
      onChange(d * 1440 + h * 60 + m)
    }
    return (
      <div className="flex flex-col gap-2 border-b border-line bg-soft px-4 pt-3 pb-3.5"
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDraft(null) }}>
        <div className="flex justify-between gap-3 text-sm text-dim">
          <span>{label}</span><span className={ok ? '' : 'font-semibold text-bad'}>{limit}</span></div>
        <div className="flex gap-2">
          <NumberBox inline label="Days" value={draft[0]} unit="d" bad={!ok} onChange={(t) => set(0, t)} />
          <NumberBox inline label="Hours" value={draft[1]} unit="h" bad={!ok} autoFocus onChange={(t) => set(1, t)} />
          <NumberBox inline label="Minutes" value={draft[2]} unit="min" bad={!ok} onChange={(t) => set(2, t)} />
        </div>
      </div>
    )
  }
  const open = () => setDraft([String(Math.floor(total / 1440)), String(Math.floor((total % 1440) / 60)),
    String(total % 60)])
  return (
    <Row label={label} sub={!ok && <span className="font-semibold text-bad">{limit}</span>} onPress={open}
      value={<span className={ok ? '' : 'text-bad'}><Duration total={total} /></span>} />
  )
}

/** On or off: the switch alone, black (or white on dark) when on. */
function Track({ checked, onChange, label }: { checked: boolean; onChange: (on: boolean) => void; label?: string }) {
  return (
    <>
      <input type="checkbox" role="switch" aria-label={label} checked={checked}
        onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent
        peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus
        after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-window after:transition
        peer-checked:after:translate-x-5 peer-checked:after:bg-on-accent" />
    </>
  )
}

/** A label and a switch, inside padded content. */
export function Switch({ label, hint, checked, onChange }:
  { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-14 items-center gap-3 py-2">
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {hint && <span className="block text-sm text-dim">{hint}</span>}
      </span>
      <Track checked={checked} onChange={onChange} />
    </label>
  )
}

/** A switch as a row of a list. */
export function ToggleRow({ label, sub, checked, onChange }:
  { label: string; sub?: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-14 w-full items-center gap-3 border-b border-line px-4 py-2 active:bg-pressed">
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
      <Track checked={checked} onChange={onChange} />
    </label>
  )
}

const BOX = 'h-12 w-full rounded-lg border border-line-strong bg-window px-3.5 text-base outline-none '
  + 'focus:border-accent focus:ring-1 focus:ring-accent'

export function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block py-2">
      <span className="mb-1.5 block text-sm text-dim">{label}</span>
      <input {...props} className={BOX} />
    </label>
  )
}

/** One choice of a few, side by side (quick sizes, scope of jobs). value '' when none of them is the current one. */
export function Segments<T extends string>({ value, options, onChange, label }:
  { value: T | ''; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex min-h-12 gap-[3px] rounded-[10px] border
      border-line-strong p-[3px]">
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={v === value} onClick={() => onChange(v)}
          className={`min-w-0 flex-1 rounded-[7px] px-1.5 py-1 text-sm leading-tight break-words
            ${v === value ? 'bg-accent font-semibold text-on-accent' : 'font-medium text-dim active:bg-pressed'}`}>
          {text}</button>
      ))}
    </div>
  )
}
export const Segmented = Segments

/** One row of a list inside padded content: icon, title, a line under it, a chevron when it opens something. */
export function ListRow({ icon: Icon, title, subtitle, trailing, onClick, danger = false }: {
  icon?: LucideIcon; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode; onClick?: () => void
  danger?: boolean
}) {
  const body = (
    <>
      {Icon && <Icon size={22} className={`shrink-0 ${danger ? 'text-bad' : 'text-dim'}`} />}
      <span className="min-w-0 flex-1 break-words">
        <span className={`block ${danger ? 'text-bad' : ''}`}>{title}</span>
        {subtitle && <span className="block text-sm text-dim">{subtitle}</span>}
      </span>
      {trailing}
      {onClick && !trailing && <ChevronRight size={18} className="shrink-0 text-dim" />}
    </>
  )
  const cls = 'flex min-h-14 w-full items-center gap-3 py-2 text-left'
  return onClick
    ? <button onClick={onClick} className={`${cls} active:bg-pressed`}>{body}</button>
    : <div className={cls}>{body}</div>
}

/** A panel from the bottom, over a dimmed screen: closes on the dimmed part or Back. */
function BottomSheet({ title, onClose, children }: { title?: string; onClose: () => void; children: ReactNode }) {
  useBackLayer(onClose)
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-scrim" onClick={onClose}>
      <div role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="max-h-[85%] overflow-y-auto rounded-t-[14px] bg-raised px-4 pt-2 pb-[calc(var(--bottom)+16px)]
          shadow-[var(--shadow-dialog)]">
        <div className="mx-auto mb-2 h-1 w-9 rounded-full bg-line-strong" />
        {title && <p className="pb-2 text-sm text-dim">{title}</p>}
        {children}
      </div>
    </div>
  )
}

export type SheetAction = { label: string; icon?: LucideIcon; danger?: boolean; onPick: () => void }

/** What ⋮ or a long-press offers: a list of actions. The dimmed part and Back close it. */
export function ActionSheet({ title, actions, onClose }:
  { title?: string; actions: SheetAction[]; onClose: () => void }) {
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="-mx-4 border-t border-line">
        {actions.map((a) => (
          <Row key={a.label} icon={a.icon} label={a.label} danger={a.danger}
            onPress={() => { onClose(); a.onPick() }} />
        ))}
      </div>
    </BottomSheet>
  )
}

/** Are you sure: what happens, then two buttons that say what they do. keep is the safe one ("Keep it", "Keep
 *  running", "Stay connected"), never a bare Cancel; a danger confirm is solid red. */
export function ConfirmSheet({ title, text, keep, confirm, danger = false, onConfirm, onClose }: {
  title: string; text?: ReactNode; keep: string; confirm: string; danger?: boolean; onConfirm: () => void
  onClose: () => void
}) {
  return (
    <BottomSheet onClose={onClose}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {text && <p className="pt-1 text-dim">{text}</p>}
      <div className="mt-5 flex flex-wrap gap-3">
        <Button className="min-w-fit flex-1 whitespace-nowrap" onClick={onClose}>{keep}</Button>
        <Button kind={danger ? 'danger' : 'primary'} className="min-w-fit flex-1 whitespace-nowrap"
          onClick={() => { onClose(); onConfirm() }}>{confirm}</Button>
      </div>
    </BottomSheet>
  )
}

export type PickerOption<T extends string> = { value: T; label: string; hint?: string }

/** Pick one of many (a queue, a group to bill, a cluster): a list with a check on the current one. */
export function PickerSheet<T extends string>({ title, options, value, onPick, onClose }: {
  title: string; options: PickerOption<T>[]; value?: T; onPick: (v: T) => void; onClose: () => void
}) {
  return (
    <BottomSheet title={title} onClose={onClose}>
      <div className="-mx-4 border-t border-line">
        {options.map((o) => (
          <Row key={o.value} label={o.label} sub={o.hint} onPress={() => { onClose(); onPick(o.value) }}>
            {o.value === value ? <Check size={20} aria-label="Chosen" className="shrink-0" /> : <span className="w-5" />}
          </Row>
        ))}
      </div>
    </BottomSheet>
  )
}

export function TextArea({ label, ...props }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block py-2">
      <span className="mb-1.5 block text-sm text-dim">{label}</span>
      <textarea {...props} className={`${BOX} min-h-28 py-3`} />
    </label>
  )
}

export function SearchField({ value, onChange, placeholder = 'Search' }:
  { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="flex h-12 items-center gap-2 rounded-[10px] bg-soft px-3.5">
      <Search size={20} className="shrink-0 text-dim" />
      <input type="search" value={value} placeholder={placeholder} aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-dim" />
      {value && <button aria-label="Clear" onClick={() => onChange('')}
        className="-mr-2 grid size-12 place-items-center rounded-full text-dim active:bg-pressed"><X size={18} /></button>}
    </label>
  )
}

/** Filters as a row of chips; several can be on (state filters), or exactly one when one is set. */
export function Chips<T extends string>({ options, value, onChange, one = false }: {
  options: readonly (readonly [T, string])[]; value: T[]; onChange: (v: T[]) => void; one?: boolean
}) {
  const flip = (v: T) => onChange(one ? [v] : value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className="flex flex-wrap gap-x-2">
      {options.map(([v, label]) => {
        const on = value.includes(v)
        return (
          <button key={v} onClick={() => flip(v)} aria-pressed={on} className="flex h-12 items-center">
            <span className={`flex h-9 items-center rounded-full border px-3.5 text-sm font-medium ${on
              ? 'border-accent bg-accent text-on-accent' : 'border-line-strong text-dim active:bg-pressed'}`}>
              {label}</span></button>
        )
      })}
    </div>
  )
}

export type Tone = 'on' | 'busy' | 'off' | 'error'

/** A small status dot: solid when on, breathing while something happens, hollow when off, red on an error. */
export function StatusDot({ tone }: { tone: Tone }) {
  const look = { on: 'bg-text', busy: 'bg-dim animate-pulse', off: 'border-[1.5px] border-dim', error: 'bg-bad' }[tone]
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${look}`} />
}

/** Nothing here yet: a grey icon, what is missing, and what to do about it. */
export function EmptyState({ icon: Icon, title, text, action }:
  { icon: LucideIcon; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-12 text-center">
      <Icon size={28} className="mb-1 text-dim" />
      <h2 className="text-base font-semibold">{title}</h2>
      {text && <p className="max-w-[36ch] text-dim">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
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
      <div className="pointer-events-none fixed inset-x-4 bottom-[calc(var(--bottom)+88px)] z-50 flex flex-col
        items-center gap-2">
        {toasts.map((t) => (
          <div key={t.id} className="rounded-[10px] bg-text px-4 py-3 text-center text-window">{t.text}</div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

/** The panel from the bottom on its own, for sheets that need more than a list or a yes/no (cancel a job). */
export { BottomSheet }

/** Ask for one line of text (a new name, a folder to go to): a field and the action. */
export function PromptSheet({ title, label, value = '', placeholder, confirm, onSubmit, onClose }: {
  title: string; label: string; value?: string; placeholder?: string; confirm: string
  onSubmit: (text: string) => void; onClose: () => void
}) {
  const [text, setText] = useState(value)
  const send = () => { if (text.trim()) { onClose(); onSubmit(text.trim()) } }
  return (
    <BottomSheet onClose={onClose}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <form onSubmit={(e) => { e.preventDefault(); send() }}>
        <Field label={label} value={text} placeholder={placeholder} autoFocus autoCapitalize="none"
          autoCorrect="off" spellCheck={false} onChange={(e) => setText(e.target.value)}
          onFocus={(e) => e.target.select()} />
      </form>
      <MainButton className="mt-3" disabled={!text.trim() || text.trim() === value.trim()} onClick={send}>
        {confirm}</MainButton>
    </BottomSheet>
  )
}
