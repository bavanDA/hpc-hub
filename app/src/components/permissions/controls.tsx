// Settings rows like Adwaita's preferences: groups with a title, switches, checks and number steppers.
import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { List, Row, Switch as UiSwitch } from '../ui'

/** Row subtitles are one line; settings explain more. */
export const wrap = (text?: string) => text && <span className="whitespace-normal">{text}</span>

export function Group({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {(title || description) && (
        <div className="px-1">
          {title && <h2 className="font-semibold">{title}</h2>}
          {description && <p className="text-sm text-dim">{description}</p>}
        </div>
      )}
      <List>{children}</List>
    </section>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label?: string }) {
  return <UiSwitch on={on} onChange={onChange} label={label} stop />
}

export function SwitchRow({ title, subtitle, on, onChange }:
  { title: string; subtitle?: string; on: boolean; onChange: (on: boolean) => void }) {
  return <Row title={title} subtitle={wrap(subtitle)} onClick={() => onChange(!on)}
    suffix={<Switch on={on} onChange={onChange} label={title} />} />
}

/** A checkbox; mixed shows the dash for "some of them". */
export function Check({ on, mixed = false, onChange, label }:
  { on: boolean; mixed?: boolean; onChange: (on: boolean) => void; label?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = mixed }, [mixed])
  return <input ref={ref} type="checkbox" checked={on} aria-label={label} onClick={(e) => e.stopPropagation()}
    onChange={(e) => onChange(e.target.checked)} className="size-[18px] shrink-0 accent-[var(--color-accent)]" />
}

/** A number you type, with - and + beside it. The typed text is kept as is; only a whole number in range is passed on.
 *  onBad tells the page while the text is out of range, so it can hold Save. */
export function StepperRow({ title, subtitle, value, min, max, unit, onChange, onBad }: {
  title: string; subtitle?: string; value: number; min: number; max: number; unit?: string
  onChange: (v: number) => void; onBad?: (bad: boolean) => void
}) {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setText(String(value)) }, [value, focused])
  const n = /^\d+$/.test(text.trim()) ? Number(text) : NaN
  const bad = !(n >= min && n <= max)
  useEffect(() => { onBad?.(bad) }, [bad, onBad])
  const type = (t: string) => {
    setText(t)
    const v = /^\d+$/.test(t.trim()) ? Number(t) : NaN
    if (v >= min && v <= max) onChange(v)
  }
  const step = (v: number) => { const next = Math.min(max, Math.max(min, v)); setText(String(next)); onChange(next) }
  const btn = 'grid size-8 place-items-center rounded-full bg-pill hover:bg-selected disabled:opacity-40'
  const limit = `${min} to ${max}${unit ? ` ${unit}` : ''}`
  return (
    <Row title={title} subtitle={bad ? <span className="text-bad">{limit}</span> : wrap(subtitle)} suffix={
      <div className="flex items-center gap-1.5">
        <input type="text" inputMode="numeric" value={text} aria-label={title} aria-invalid={bad}
          onChange={(e) => type(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          className={`h-8 w-14 rounded-md bg-pill text-center tabular-nums outline-none
            focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus ${bad ? 'ring-2 ring-inset ring-bad' : ''}`} />
        {unit && <span className="text-dim">{unit}</span>}
        <button aria-label="Less" className={btn} disabled={bad || value <= min} onClick={() => step(value - 1)}>
          <Minus size={14} /></button>
        <button aria-label="More" className={btn} disabled={bad || value >= max} onClick={() => step(value + 1)}>
          <Plus size={14} /></button>
      </div>} />
  )
}
