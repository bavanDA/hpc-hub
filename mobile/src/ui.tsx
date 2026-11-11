// The phone's pieces, the same as the desktop's (app/src/components/e), so the phone matches it row for row. Pieces
// made for a phone: Dialog and the other windows take part in Android's Back (nav.tsx useBackLayer), Tabs scroll
// sideways, and the old full-screen Sheet and bottom panels stay until their pages are redone (mobile/REDESIGN.md).
import { ChevronDown, ChevronRight, X, type LucideIcon } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'

import type { TabItem } from '@shared/components/app/Tabs'
import { ConfirmDialog as EConfirmDialog } from '@shared/components/e/ConfirmDialog'
import { EDialog } from '@shared/components/e/EDialog'
import { Field } from '@shared/components/e/Field'
import { MainButton } from '@shared/components/e/MainButton'
import { PickDialog as EPickDialog } from '@shared/components/e/PickDialog'
import { Row } from '@shared/components/e/Row'
import { ROW } from '@shared/components/e/styles'
import { Segments } from '@shared/components/e/Segments'
import { Switch as ETrack } from '@shared/components/e/Switch'
import type { MenuItem } from '@shared/components/projects/Menu'
import { ToastProvider } from '@shared/components/toast'
import { useToast } from '@shared/components/useToast'
import { useBackLayer } from './nav'

export { Amount } from '@shared/components/e/Amount'
export { DurationRow } from '@shared/components/e/DurationRow'
export { EButton as Button } from '@shared/components/e/EButton'
export { EmptyState } from '@shared/components/e/EmptyState'
export { Field }
export { ItemRow } from '@shared/components/e/ItemRow'
export { MainButton }
export { NumberRow } from '@shared/components/e/NumberRow'
export { inRange } from '@shared/components/e/range'
export { Row }
export { SearchField } from '@shared/components/e/SearchField'
export { Section } from '@shared/components/e/Section'
export { Segments }
export { StatusDot, type Tone } from '@shared/components/e/StatusDot'
export { TextArea } from '@shared/components/e/TextArea'
export type { TabItem } from '@shared/components/app/Tabs'
export type { MenuItem } from '@shared/components/projects/Menu'
export { ToastProvider, useToast }

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-line bg-card p-4 ${className}`}>{children}</section>
}

/** Mount with a window from the desktop that doesn't know about Back: Back closes it (AboutDialog in Settings). */
export function BackLayer({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  useBackLayer(onBack)
  return children
}

// -- windows: the desktop's dialog, centred, closed by Android's Back -------------------------------------------

/** The desktop's window: title and close at the top, content that scrolls, actions at the bottom. Content has no
 *  padding, for windows made of rows; padded content goes in a div with px-5. */
export function Dialog(props: ComponentProps<typeof EDialog>) {
  useBackLayer(props.onClose)
  useBackLayer(props.onBack ?? props.onClose, !!props.onBack)  // with a back arrow, Android's Back does what it does first
  return <EDialog {...props} />
}

/** The desktop's confirm window: what happens, then two buttons that say what they do (never a bare Cancel). */
export function ConfirmDialog(props: ComponentProps<typeof EConfirmDialog>) {
  useBackLayer(props.onClose)
  return <EConfirmDialog {...props} />
}
export const ConfirmSheet = ConfirmDialog

/** Pick one of many: the desktop's list window, a check on the current one. */
export function PickDialog<T extends string>(props: ComponentProps<typeof EPickDialog<T>>) {
  useBackLayer(props.onClose)
  return <EPickDialog {...props} />
}
export type PickerOption<T extends string> = { value: T; label: string; hint?: string }
export const PickerSheet = PickDialog

// -- the page frame: tabs, buttons, menus -------------------------------------------------------------------------

/** The desktop's tab row, scrolling sideways when there isn't room (under a page's Header). */
export function Tabs<T extends string>({ tabs, current, onPick, label }:
  { tabs: TabItem<T>[]; current: T; onPick: (id: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2
      [scrollbar-width:none]">
      {tabs.map(({ id, title, icon: Icon }) => (
        <button key={id} role="tab" aria-selected={id === current} onClick={() => onPick(id)}
          className={`-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-2.5 font-semibold ${
            id === current ? 'border-accent text-text' : 'border-transparent text-dim active:text-text'}`}>
          {Icon && <Icon size={16} />}{title}
        </button>
      ))}
    </div>
  )
}

/** Above the page's content, under the tabs: buttons on the right, a note on the left (the desktop's page actions). */
export function PageBar({ children }: { children: ReactNode }) {
  return <div className="flex min-h-14 shrink-0 items-center gap-2 pr-3 pb-2 pl-5">{children}</div>
}

/** A square icon button, 40 px (36 with small). */
export function IconBtn({ icon: Icon, label, onClick, small = false, iconSize = 16, disabled }: {
  icon: LucideIcon; label: string; onClick?: () => void; small?: boolean; iconSize?: number; disabled?: boolean
}) {
  return (
    <button aria-label={label} onClick={onClick} disabled={disabled}
      className={`grid shrink-0 place-items-center rounded-md text-dim active:bg-pressed disabled:opacity-40 ${
        small ? 'size-9' : 'size-10'}`}><Icon size={iconSize} /></button>
  )
}

/** The desktop's select (filters, a queue): the current choice and an arrow. Opens a PickDialog. */
export function SelectButton({ label, onPress, className = '' }:
  { label: ReactNode; onPress: () => void; className?: string }) {
  return (
    <button onClick={onPress} className={`flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border
      border-line-strong bg-window pr-2.5 pl-3 font-medium whitespace-nowrap active:bg-pressed ${className}`}>
      <span className="min-w-0 truncate">{label}</span><ChevronDown size={16} className="shrink-0 text-dim" />
    </button>
  )
}

/** The desktop's menu: a button (⋮ with an icon as trigger) and its list under it. Back and a tap away close it.
 *  Each group is separated by a hairline. */
export function Menu({ groups, trigger, label, className = '' }:
  { groups: MenuItem[][]; trigger: ReactNode; label: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [at, setAt] = useState<{ top: number; right: number } | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useBackLayer(() => setOpen(false), open)
  useLayoutEffect(() => {
    if (!open || !button.current) return
    const r = button.current.getBoundingClientRect()
    const height = menu.current?.offsetHeight ?? 0
    const up = r.bottom + 6 + height > window.innerHeight && r.top - 6 - height > 0
    setAt({ top: up ? r.top - 6 - height : r.bottom + 6, right: window.innerWidth - r.right })
  }, [open])
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => {
      if (e.target instanceof Node && (menu.current?.contains(e.target) || button.current?.contains(e.target))) return
      setOpen(false)
    }
    window.addEventListener('mousedown', away, true)
    window.addEventListener('scroll', away, true)
    return () => { window.removeEventListener('mousedown', away, true); window.removeEventListener('scroll', away, true) }
  }, [open])
  return (
    <>
      <button ref={button} aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)} className={className}>
        {trigger}</button>
      {open && (
        <div ref={menu} role="menu" style={{ top: at?.top ?? -9999, right: at?.right ?? 0 }}
          className="menu-in fixed z-50 min-w-[200px] rounded-lg bg-raised py-1 shadow-[var(--shadow-menu)]">
          {groups.filter((g) => g.length).map((g, n) => (
            <div key={n} className={n ? 'mt-1 border-t border-line pt-1' : ''}>
              {g.map(({ label: text, icon: Icon, onClick, danger }) => (
                <button key={text} role="menuitem" onClick={() => { setOpen(false); onClick() }}
                  className={`flex h-10 w-full items-center gap-3 px-3 text-left active:bg-pressed ${danger ? 'text-bad' : ''}`}>
                  {Icon && <Icon size={16} className={`shrink-0 ${danger ? '' : 'text-dim'}`} />}
                  <span className="truncate">{text}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// -- rows and switches ---------------------------------------------------------------------------------------------

/** A list of rows: a hairline on top, each row draws the one under it. */
export function List({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`border-t border-line ${className}`}>{children}</div>
}

/** A label and a switch, inside padded content. */
export function Switch({ label, hint, checked, onChange }:
  { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-12 items-center gap-3 py-2">
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {hint && <span className="block text-sm text-dim">{hint}</span>}
      </span>
      <ETrack checked={checked} onChange={onChange} label={label} />
    </label>
  )
}

/** A switch as a row of a list (the desktop's, with room for an icon). */
export function ToggleRow({ label, sub, checked, onChange, icon: Icon }:
  { label: string; sub?: ReactNode; checked: boolean; onChange: (on: boolean) => void; icon?: LucideIcon }) {
  return (
    <label className={`${ROW} active:bg-pressed`}>
      {Icon && <Icon size={18} className="shrink-0 text-dim" />}
      <span className="min-w-0 flex-1 break-words">
        <span className="block">{label}</span>
        {sub && <span className="block text-sm text-dim">{sub}</span>}
      </span>
      <ETrack checked={checked} onChange={onChange} label={typeof label === 'string' ? label : undefined} />
    </label>
  )
}

export const Segmented = Segments

// -- the old pieces, until their pages are redone (mobile/REDESIGN.md) ----------------------------------------------

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
      {actions && <footer className="flex shrink-0 flex-wrap gap-3 px-4 py-3 [&>button]:min-w-fit [&>button]:whitespace-nowrap">
        {actions}</footer>}
    </div>
  )
}

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
  const cls = 'flex min-h-12 w-full items-center gap-3 py-2 text-left'
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

/** X on a sheet with unsaved changes asks first. Returns the close to give the sheet and the question to render. */
export function useAskBeforeClose(dirty: boolean, onClose: () => void): [() => void, ReactNode] {
  const [asking, setAsking] = useState(false)
  const close = () => (dirty ? setAsking(true) : onClose())
  const ask = asking && <ConfirmSheet title="Throw away your changes?" keep="Keep editing" confirm="Throw away" danger
    onClose={() => setAsking(false)} onConfirm={onClose} />
  return [close, ask]
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
