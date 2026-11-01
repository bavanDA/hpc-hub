// Settings rows like Adwaita's preferences: groups with a title, switches, checks and number steppers.
import { Minus, Plus } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

import { List, Row, Switch as UiSwitch } from '../ui'

/** Row subtitles are one line; settings explain more. */
export const wrap = (text?: string) => text && <span className="whitespace-normal">{text}</span>

export function Group({ title, description, children }: { title?: string; description?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      {(title || description) && (
        <div className="px-1">
          {title && <h2 className="font-bold">{title}</h2>}
          {description && <p className="text-[13px] text-dim">{description}</p>}
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

export function StepperRow({ title, subtitle, value, min, max, onChange }: {
  title: string; subtitle?: string; value: number; min: number; max: number; onChange: (v: number) => void
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, Number.isFinite(v) ? Math.round(v) : min)))
  const btn = 'grid size-8 place-items-center rounded-full bg-pill hover:bg-selected disabled:opacity-40'
  return (
    <Row title={title} subtitle={wrap(subtitle)} suffix={
      <div className="flex items-center gap-1.5">
        <input type="number" value={value} min={min} max={max} aria-label={title}
          onChange={(e) => set(Number(e.target.value))}
          className="h-8 w-14 rounded-md bg-pill text-center tabular-nums outline-none [appearance:textfield]
            focus:ring-2 focus:ring-accent [&::-webkit-inner-spin-button]:appearance-none" />
        <button aria-label="Less" className={btn} disabled={value <= min} onClick={() => set(value - 1)}>
          <Minus size={14} /></button>
        <button aria-label="More" className={btn} disabled={value >= max} onClick={() => set(value + 1)}>
          <Plus size={14} /></button>
      </div>} />
  )
}
