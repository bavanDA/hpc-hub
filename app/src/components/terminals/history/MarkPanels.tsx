// Marks: the list, the box that names one, and the saved text when tmux has moved on. As pieces inside the terminal's
// area so a phone and a desktop can each lay them out (a popover on the desktop, a sheet at the bottom of the phone).
import { Copy, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'

import type { Mark } from '../../../types/terminals'
import { Button } from '../../ui/Button'
import { IconButton } from '../../ui/IconButton'
import { copyText } from '../xterm'

export type Note = (text: string) => void

/** Outside clicks close a desktop popover. Skips the button that opened it (data-panel-toggle), which toggles it itself. */
export function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void, active: boolean) {
  useEffect(() => {
    if (!active) return
    const down = (e: PointerEvent) => {
      const t = e.target as Element
      if (!ref.current?.contains(t) && !t.closest('[data-panel-toggle]')) onOutside()
    }
    document.addEventListener('pointerdown', down, true)
    return () => document.removeEventListener('pointerdown', down, true)
  })
}
const firstLine = (text: string) => text.split('\n').find((l) => /[a-z0-9]/i.test(l))?.trim() ?? ''

export function MarkRows({ marks, onOpen, onRename, onRemove, note, phone }: {
  marks: Mark[]; onOpen: (m: Mark) => void; onRename: (m: Mark) => void; onRemove: (m: Mark) => void; note: Note
  phone: boolean
}) {
  if (!marks.length) return <p className="p-2.5 text-sm text-dim">Nothing marked yet.</p>
  const size = phone ? undefined : 'small'
  const button = (icon: typeof Copy, label: string, fn: () => void) => (
    <IconButton icon={icon} label={label} size={14} small={size === 'small'} onClick={fn} />
  )
  return (
    <div>
      {marks.map((m) => (
        <div key={m.id} onClick={() => onOpen(m)}
          className="grid cursor-pointer grid-cols-[1fr_auto] items-start gap-x-1.5 rounded-lg px-2 py-1.5 hover:bg-hover active:bg-pressed">
          <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{m.name}</span>
            {!m.live && <span className="shrink-0 rounded-sm bg-warn-bg px-1.5 text-[10px] leading-[14px] font-semibold text-warn">Saved copy</span>}
          </div>
          <div className="flex" onClick={(e) => e.stopPropagation()}>
            {button(Copy, 'Copy', () => void copyText(m.text).then((ok) => note(ok ? `Copied ${m.name}` : 'Could not copy')))}
            {button(Pencil, 'Rename', () => onRename(m))}
            {button(X, 'Remove', () => onRemove(m))}
          </div>
          <div className="col-span-full mt-0.5 truncate font-mono text-[11px] leading-[15px] text-dim">{firstLine(m.text)}</div>
        </div>
      ))}
    </div>
  )
}

/** Name a new mark, or rename one: Save keeps the name, Remove takes the mark away. */
export function MarkName({ mark, phone, title, y, onSave, onRemove, onClose }: {
  mark: Mark; phone: boolean; title: string; y?: number; onSave: (name: string) => void; onRemove: () => void
  onClose: () => void
}) {
  const [name, setName] = useState(mark.name)
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])
  const save = (e?: FormEvent) => { e?.preventDefault(); if (name.trim()) onSave(name.trim()); else onClose() }
  useOutside(box, () => save(), !phone)
  const body = (
    <form onSubmit={save} className={`grid gap-2 ${phone ? 'p-3.5' : 'p-2.5'}`}>
      <label htmlFor="mark-name" className="text-xs font-semibold text-dim">{title}</label>
      <input ref={input} id="mark-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" maxLength={80}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
        className="h-8 w-full rounded-md border border-line-strong bg-control px-2 outline-none focus:border-focus" />
      <pre className="max-h-[62px] overflow-hidden font-mono text-[11px] leading-[15px] whitespace-pre text-dim">
        {mark.text.split('\n').slice(0, 3).join('\n')}
      </pre>
      <div className="flex justify-end gap-1.5">
        <Button type="button" size="sm" kind="ghost" onClick={onRemove}>Remove mark</Button>
        <Button size="sm" kind="primary">Save</Button>
      </div>
    </form>
  )
  if (phone) return <Sheet onClose={onClose}>{body}</Sheet>
  return (
    <div ref={box} className="absolute left-6 z-20 w-[300px] rounded-xl bg-raised shadow-[var(--shadow-menu)]"
      style={{ top: Math.max(8, Math.min(y ?? 60, 400)) }}>{body}</div>
  )
}

/** The text saved with a mark, when tmux no longer has those lines (or the session is gone). */
export function SavedCopy({ mark, ended, phone, onClose, note }: { mark: Mark; ended: boolean; phone: boolean
  onClose: () => void; note: Note }) {
  const box = useRef<HTMLDivElement>(null)
  useOutside(box, onClose, !phone)
  const body = (
    <>
      <h3 className="flex items-center gap-1.5 px-3 pt-2.5 pb-1 text-base font-semibold">
        <span className="min-w-0 truncate">{mark.name}</span>
        <span className="shrink-0 rounded-sm bg-warn-bg px-1.5 text-[10px] leading-[14px] font-semibold text-warn">Saved copy</span>
      </h3>
      <p className="px-3 pb-1.5 text-xs text-dim">
        {ended ? 'This session has ended.' : 'This spot is no longer in tmux\'s history.'} This is the text saved with the mark.
      </p>
      <pre className={`min-h-0 flex-1 overflow-auto px-3 py-2 font-mono whitespace-pre ${phone ? 'text-[10px] leading-[14px]' : 'text-xs leading-4'}`}>{mark.text}</pre>
      <div className="flex justify-end gap-1.5 p-2.5 pt-2">
        <Button size="sm" onClick={() => void copyText(mark.text).then((ok) => note(ok ? 'Copied' : 'Could not copy'))}>Copy</Button>
        <Button size="sm" kind="primary" onClick={onClose}>Close</Button>
      </div>
    </>
  )
  if (phone) return <Sheet onClose={onClose} tall>{body}</Sheet>
  return (
    <div ref={box} className="absolute inset-x-10 top-10 z-20 flex max-h-[calc(100%-80px)] flex-col rounded-xl bg-raised shadow-[var(--shadow-dialog)]">
      {body}
    </div>
  )
}

/** A sheet from the bottom of the terminal's area, on a phone. */
export function Sheet({ children, onClose, tall = false }: { children: React.ReactNode; onClose: () => void; tall?: boolean }) {
  return (
    <>
      <div className="absolute inset-0 z-20 bg-scrim" onPointerDown={onClose} />
      <div className={`absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[14px] bg-raised shadow-[var(--shadow-dialog)] ${tall ? 'max-h-[80%]' : 'max-h-[74%]'}`}>
        {children}
      </div>
    </>
  )
}
