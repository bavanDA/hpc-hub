// Form rows for the cluster dialogs, shaped like Adwaita's preference rows (entry, spin, switch).
import { Eye, EyeOff, Minus, Plus } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { List } from '../ui'

export function Group({ title, description, children }:
  { title?: string; description?: string; children: ReactNode }) {
  return (
    <div className="mb-5">
      {title && <h3 className="mb-1 text-[15px] font-bold">{title}</h3>}
      {description && <p className="mb-2 text-[13px] text-dim">{description}</p>}
      <List>{children}</List>
    </div>
  )
}

function RowBox({ label, sub, children }: { label: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
      <div className="min-w-0 flex-1">
        <div>{label}</div>
        {sub && <div className="text-[13px] text-dim">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

/** A text field with its title above the text, like Adw.EntryRow. */
export function EntryRow({ label, value, onChange, placeholder, password, list, autoFocus }:
  { label: string; value: string; onChange: (v: string) => void; placeholder?: string; password?: boolean;
    list?: string[]; autoFocus?: boolean }) {
  const [shown, setShown] = useState(false)
  const id = list ? `list-${label.replace(/\W/g, '')}` : undefined
  return (
    <label className="flex min-h-[56px] items-center gap-2 px-4 py-1.5 focus-within:bg-hover">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-dim">{label}</div>
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          type={password && !shown ? 'password' : 'text'} list={id} autoFocus={autoFocus} spellCheck={false}
          autoComplete="off"
          className="w-full bg-transparent text-[15px] outline-none placeholder:text-dim
            [&::-webkit-calendar-picker-indicator]:opacity-40" />
        {list && <datalist id={id}>{list.map((x) => <option key={x} value={x} />)}</datalist>}
      </div>
      {password && (
        <button type="button" onClick={() => setShown(!shown)} aria-label={shown ? 'Hide' : 'Show'}
          className="grid size-8 place-items-center rounded-full hover:bg-hover">
          {shown ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      )}
    </label>
  )
}

export function NumberBox({ value, onChange, min, max, label, width = 56 }:
  { value: number; onChange: (v: number) => void; min: number; max: number; label: string; width?: number }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? Math.round(v) : min))
  const step = 'grid size-8 place-items-center rounded-full bg-pill hover:bg-selected disabled:opacity-40'
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label={`Less ${label}`} className={step} disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}><Minus size={14} /></button>
      <input aria-label={label} inputMode="numeric" value={value} style={{ width }}
        onChange={(e) => onChange(clamp(parseInt(e.target.value || '0', 10)))}
        className="h-8 rounded-md bg-pill text-center tabular-nums outline-none focus:ring-2 focus:ring-accent" />
      <button type="button" aria-label={`More ${label}`} className={step} disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}><Plus size={14} /></button>
    </div>
  )
}

export function SpinRow({ label, sub, value, onChange, min, max }:
  { label: string; sub?: string; value: number; onChange: (v: number) => void; min: number; max: number }) {
  return <RowBox label={label} sub={sub}><NumberBox {...{ value, onChange, min, max, label }} /></RowBox>
}

export function Toggle({ checked, onChange, label }:
  { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[48px] shrink-0 rounded-full transition ${
        checked ? 'bg-accent' : 'bg-selected'}`}>
      <span className={`absolute top-[3px] size-5 rounded-full bg-white shadow transition-all ${
        checked ? 'left-[25px]' : 'left-[3px]'}`} />
    </button>
  )
}

export function SwitchRow({ label, sub, checked, onChange }:
  { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <RowBox label={label} sub={sub}><Toggle {...{ checked, onChange, label }} /></RowBox>
}

/** A checkbox before its label, for a yes or no that goes with the row above it. */
export function CheckRow({ label, sub, checked, onChange }:
  { label: string; sub?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-[56px] cursor-pointer items-center gap-3 px-4 py-2 hover:bg-hover">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="size-[18px] shrink-0 accent-[var(--color-accent)]" />
      <div className="min-w-0 flex-1">
        <div>{label}</div>
        {sub && <div className="text-[13px] text-dim">{sub}</div>}
      </div>
    </label>
  )
}

export function ActionRow({ label, sub, children }: { label: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return <RowBox label={label} sub={sub}>{children}</RowBox>
}

/** A choice from a short list, like Adw.ComboRow. */
export function ComboRow({ label, sub, value, onChange, options }:
  { label: string; sub?: ReactNode; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <RowBox label={label} sub={sub}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className="h-9 max-w-[300px] rounded-md bg-pill px-2 outline-none focus:ring-2 focus:ring-accent">
        {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </RowBox>
  )
}

/** A whole row that is a button, like Adw.ButtonRow. */
export function ButtonRow({ label, onClick, tone = 'accent', icon }:
  { label: string; onClick: () => void; tone?: 'accent' | 'bad'; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex min-h-[52px] w-full items-center justify-center gap-2 px-4 font-bold hover:bg-hover ${
        tone === 'bad' ? 'text-bad' : 'text-accent-text'}`}>
      {icon}{label}
    </button>
  )
}
