// The phone's style E pieces (mobile/src/ui.tsx) at desktop size, for the windows moved to it: rows on a plain
// background with hairlines, label left and value right, numbers typed in place, one solid main button. Everything
// sits inside an EDialog, which carries the style-e colors (index.css).
import { Check, ChevronRight, X, type LucideIcon } from 'lucide-react'
import { useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react'

import { human } from '../clusters/time'
import { useEscape } from '../ui'

/** A window over the app in style E: title on the left, X on the right, rows, the main button at the bottom. */
export function EDialog({ title, onClose, children, actions, width = 520 }:
  { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode; width?: number }) {
  useEscape(onClose)
  return (
    <div className="style-e dialog-scrim fixed inset-0 z-40 grid place-items-center bg-scrim p-4"
      onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        style={{ width }} className="dialog-in flex max-h-[90vh] max-w-full flex-col rounded-xl bg-window
          shadow-[var(--shadow-dialog)]">
        <header className="flex h-14 shrink-0 items-center gap-2 pr-2 pl-5">
          <h2 className="min-w-0 flex-1 text-lg font-semibold">{title}</h2>
          <button aria-label="Close" onClick={onClose} className="grid size-9 place-items-center rounded-md
            text-dim hover:bg-hover active:bg-pressed"><X size={18} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">{children}</div>
        {actions && <footer className="flex shrink-0 gap-2 px-5 pt-3 pb-5">{actions}</footer>}
      </div>
    </div>
  )
}

/** The window's main action: full width, solid (black on light, white on dark). */
export function MainButton({ icon: Icon, className = '', children, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon }) {
  return (
    <button {...props} className={`flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4
      font-semibold text-on-accent hover:bg-accent-hover active:bg-accent-pressed disabled:opacity-40 ${className}`}>
      {Icon && <Icon size={18} className="shrink-0" />}{children}
    </button>
  )
}

/** A list of rows: a hairline on top, each row draws the one under it. */
export function List({ children }: { children: ReactNode }) {
  return <div className="border-t border-line">{children}</div>
}

/** A titled group of rows. */
export function Section({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="pt-5">
      {title && <h3 className="px-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">{title}</h3>}
      <List>{children}</List>
      {note && <p className="px-5 pt-2 text-sm text-dim">{note}</p>}
    </section>
  )
}

const ROW = 'flex min-h-12 w-full items-center gap-3 border-b border-line px-5 py-2 text-left'

/** One row: label on the left, value on the right. A chevron only when it opens another window (opens). */
export function Row({ label, sub, value, opens = false, onPress, children }: {
  label: ReactNode; sub?: ReactNode; value?: ReactNode; opens?: boolean; onPress?: () => void; children?: ReactNode
}) {
  const body = (
    <>
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
      {value !== undefined && <span className="max-w-[60%] text-right font-medium break-words tabular-nums">
        {value}</span>}
      {children}
      {opens && <ChevronRight size={16} className="-mr-1 shrink-0 text-dim" />}
    </>
  )
  return onPress
    ? <button onClick={onPress} className={`${ROW} hover:bg-hover active:bg-pressed`}>{body}</button>
    : <div className={ROW}>{body}</div>
}

/** A check on the chosen row of a list, room for one on the others. */
export const Tick = ({ on }: { on: boolean }) =>
  on ? <Check size={18} aria-label="Chosen" className="shrink-0" /> : <span className="w-[18px]" />

/** A number and its unit, the unit smaller and grey: 8 GB. */
export function Amount({ n, unit }: { n: ReactNode; unit?: string }) {
  return <>{n}{unit && <small className="ml-1 text-sm font-normal text-dim">{unit}</small>}</>
}

export const inRange = (v: number, min: number, max?: number | null) => v >= min && (!max || v <= max)

function NumberBox({ label, value, unit, bad, onChange, autoFocus, inline = false }: {
  label: string; value: string; unit: string; bad: boolean; onChange: (text: string) => void; autoFocus?: boolean
  inline?: boolean
}) {
  return (
    <label className={`flex h-11 min-w-0 shrink-0 items-center ${inline ? 'grow basis-0' : ''} rounded-lg
      border-[1.5px] bg-window px-3 ${bad ? 'border-bad' : 'border-accent'}`}>
      <input aria-label={label} aria-invalid={bad} type="text" inputMode="numeric" autoFocus={autoFocus}
        value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        onFocus={(e) => e.target.select()} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="w-full min-w-0 bg-transparent text-[18px] font-semibold tabular-nums outline-none" />
      <span className="ml-2 shrink-0 text-dim">{unit}</span>
    </label>
  )
}

/** A number row (cores, GB, GPUs). Click it and it opens in place as a big input with its limit; any whole number
 *  from min to max can be typed. Out of range, the limit turns red and stays under the row. */
export function NumberRow({ label, value, unit, showUnit = true, min = 1, max, onChange }: {
  label: string; value: number; unit: string; showUnit?: boolean; min?: number; max?: number | null
  onChange: (n: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const ok = inRange(value, min, max)
  const limit = value < min ? `At least ${min} ${unit}` : max ? `Up to ${max} ${unit}` : ''
  if (draft !== null) {
    return (
      <div className="flex flex-col gap-2 border-b border-line bg-soft px-5 pt-2.5 pb-3" onBlur={() => setDraft(null)}>
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

function Duration({ total }: { total: number }) {
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60
  const parts = ([[d, d === 1 ? 'day' : 'days'], [h, 'h'], [m, 'min']] as const).filter(([n]) => n > 0)
  if (!parts.length) return <Amount n={0} unit="min" />
  return <>{parts.map(([n, unit], i) => <span key={unit}>{i > 0 && ' '}<Amount n={n} unit={unit} /></span>)}</>
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
      <div className="flex flex-col gap-2 border-b border-line bg-soft px-5 pt-2.5 pb-3"
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

/** A switch as a row of a list, black (or white on dark) when on. */
export function ToggleRow({ label, sub, checked, onChange }:
  { label: string; sub?: ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className={`${ROW} hover:bg-hover`}>
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only" />
      <span className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-accent
        peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus
        after:absolute after:top-1 after:left-1 after:size-4 after:rounded-full after:bg-window after:transition
        peer-checked:after:translate-x-4 peer-checked:after:bg-on-accent" />
    </label>
  )
}

/** One choice of a few, side by side. value '' when none of them is the current one. */
export function Segments<T extends string>({ value, options, onChange, label }:
  { value: T | ''; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex min-h-10 gap-[3px] rounded-lg border
      border-line-strong p-[3px]">
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={v === value} onClick={() => onChange(v)}
          className={`min-w-0 flex-1 rounded-md px-2 py-1 text-sm leading-tight break-words ${v === value
            ? 'bg-accent font-semibold text-on-accent' : 'font-medium text-dim hover:bg-hover active:bg-pressed'}`}>
          {text}</button>
      ))}
    </div>
  )
}

const BOX = 'h-10 w-full rounded-lg border border-line-strong bg-window px-3 outline-none placeholder:text-faint '
  + 'focus:border-accent focus:ring-1 focus:ring-accent'

export function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block py-1.5">
      <span className="mb-1.5 block text-sm text-dim">{label}</span>
      <input spellCheck={false} autoComplete="off" {...props} className={BOX} />
    </label>
  )
}
