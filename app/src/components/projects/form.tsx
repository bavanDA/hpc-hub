// Rows for settings-like dialogs, in the style of Adwaita's preference groups (boxed lists of rows).
import { Children, type ReactNode } from 'react'

import { List, Switch as UiSwitch } from '../ui'

export function Group({ title, description, suffix, children }:
  { title?: string; description?: ReactNode; suffix?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {(title || suffix) && (
        <div className="flex items-end gap-3 px-1">
          <div className="min-w-0 flex-1">
            {title && <h3 className="text-md font-semibold">{title}</h3>}
            {description && <p className="text-sm text-dim">{description}</p>}
          </div>
          {suffix}
        </div>
      )}
      {!title && description && <p className="px-1 text-sm text-dim">{description}</p>}
      {Children.toArray(children).length > 0 && <List>{children}</List>}
    </div>
  )
}

export function EntryRow({ title, value, onChange, suffix, autoFocus, mono }:
  { title: string; value: string; onChange: (v: string) => void; suffix?: ReactNode; autoFocus?: boolean;
    mono?: boolean }) {
  return (
    <label className="flex min-h-[56px] items-center gap-3 px-4 focus-within:bg-hover">
      <div className="flex min-w-0 flex-1 flex-col py-1.5">
        <span className="text-xs text-dim">{title}</span>
        <input value={value} onChange={(e) => onChange(e.target.value)} autoFocus={autoFocus} spellCheck={false}
          className={`w-full bg-transparent outline-none ${mono ? 'font-mono text-base' : ''}`} />
      </div>
      {suffix}
    </label>
  )
}

export function SelectRow<T extends string>({ title, subtitle, value, options, onChange }:
  { title: string; subtitle?: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className="flex min-h-[56px] items-center gap-3 px-4 py-2">
      <div className="min-w-0 flex-1">
        <div>{title}</div>
        {subtitle && <div className="text-sm text-dim">{subtitle}</div>}
      </div>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}
        className="h-9 max-w-[60%] rounded-md bg-pill px-2 font-semibold outline-none hover:bg-selected">
        {options.map((o) => <option key={o.value} value={o.value} className="bg-window text-text">{o.label}</option>)}
      </select>
    </label>
  )
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <UiSwitch on={on} onChange={onChange} label={label} />
}

export function SwitchRow({ title, on, onChange }: { title: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-[56px] items-center gap-3 px-4 py-2">
      <span className="flex-1">{title}</span>
      <Switch on={on} onChange={onChange} label={title} />
    </div>
  )
}

/** A read-only value with its name above it (Adwaita's "property" row). */
export function PropertyRow({ title, value }: { title: string; value: ReactNode }) {
  return (
    <div className="flex min-h-[56px] flex-col justify-center px-4 py-2">
      <span className="text-xs text-dim">{title}</span>
      <span className="select-text break-all">{value}</span>
    </div>
  )
}

export function CheckRow({ title, checked, onChange, suffix }:
  { title: ReactNode; checked: boolean; onChange: (v: boolean) => void; suffix?: ReactNode }) {
  return (
    <label className="flex min-h-[48px] items-center gap-3 px-4 py-2 hover:bg-hover">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="size-[18px] shrink-0 accent-[var(--color-accent)]" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      {suffix}
    </label>
  )
}

/** A row of linked toggle buttons; one is on (or none). */
export function Toggles({ items, active, onPick }:
  { items: { name: string; tip?: string }[]; active: string | null; onPick: (name: string) => void }) {
  return (
    <div className="flex shrink-0 rounded-lg bg-pill p-[3px]">
      {items.map((t) => (
        <button key={t.name} title={t.tip} onClick={() => onPick(t.name)}
          className={`h-[30px] rounded-md px-3 text-base font-semibold ${
            t.name === active ? 'bg-card shadow-sm' : 'hover:bg-hover'}`}>{t.name}</button>
      ))}
    </div>
  )
}

export function ErrorText({ text }: { text: string }) {
  return text ? <p className="select-text px-1 text-base text-bad">{text}</p> : null
}
