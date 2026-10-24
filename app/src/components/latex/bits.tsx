// Small pieces of the LaTeX page: a popover under a button, a draggable split, and how paths and times show.
import { useEffect, useRef, useState, type ReactNode } from 'react'

/** A panel under its button; a click outside or Escape closes it. */
export function Popover({ button, children, align = 'right', width = 280 }:
  { button: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode;
    align?: 'left' | 'right'; width?: number }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', down)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', down); window.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div ref={box} className="relative">
      {button(open, () => setOpen(!open))}
      {open && (
        <div style={{ width }} className={`absolute top-full z-30 mt-1.5 rounded-xl border border-line bg-window p-1.5
          shadow-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function MenuButton({ icon, label, hint, onClick, disabled }:
  { icon: ReactNode; label: string; hint?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-hover disabled:opacity-50">
      <span className="text-dim">{icon}</span>
      <span className="flex-1">{label}</span>
      {hint && <span className="text-[12px] text-dim">{hint}</span>}
    </button>
  )
}

function stored(key: string, fallback: number): number {
  try { return Number(localStorage.getItem(key)) || fallback } catch { return fallback }
}

/** Two panes side by side with a handle between; the split (a fraction) is remembered under `name`. */
export function Split({ name, left, right, show, min = 0.2 }:
  { name: string; left: ReactNode; right: ReactNode; show: 'both' | 'left' | 'right'; min?: number }) {
  const [part, setPart] = useState(() => stored(`latex.split.${name}`, 0.5))
  const box = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const drag = (e: React.PointerEvent) => {
    e.preventDefault()
    const r = box.current!.getBoundingClientRect()
    setDragging(true)
    const move = (m: PointerEvent) => setPart(Math.max(min, Math.min(1 - min, (m.clientX - r.left) / r.width)))
    const up = () => {
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      setPart((p) => { try { localStorage.setItem(`latex.split.${name}`, String(p)) } catch { /* private */ } return p })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  const both = show === 'both'
  return (
    <div ref={box} className={`flex min-h-0 min-w-0 flex-1 ${dragging ? 'cursor-col-resize select-none' : ''}`}>
      <div style={both ? { width: `${part * 100}%` } : undefined}
        className={`min-w-0 ${show === 'right' ? 'hidden' : both ? 'shrink-0' : 'flex-1'} ${dragging ? 'pointer-events-none' : ''}`}>
        {left}</div>
      {both && <div onPointerDown={drag} role="separator" aria-orientation="vertical"
        className="group relative w-[5px] shrink-0 cursor-col-resize bg-line hover:bg-accent/60">
        <div className="absolute inset-y-0 -left-1 -right-1" /></div>}
      <div className={`min-w-0 flex-1 ${show === 'left' ? 'hidden' : ''} ${dragging ? 'pointer-events-none' : ''}`}>
        {right}</div>
    </div>
  )
}

export const basename = (p: string) => p.replace(/\/+$/, '').split('/').pop() || p
export const dirname = (p: string) => p.slice(0, Math.max(0, p.lastIndexOf('/'))) || '/'
export const rel = (folder: string, p: string) => p.startsWith(folder + '/') ? p.slice(folder.length + 1) : p
export const short = (p: string) => p.replace(/^(?:\/mmfs1)?\/home\/[^/]+/, '~')

/** 5 minutes ago, 3 days ago, Mar 3 2024. */
export function ago(ts: number): string {
  if (!ts) return ''
  const s = Date.now() / 1000 - ts
  const n = (v: number, u: string) => `${Math.floor(v)} ${u}${Math.floor(v) === 1 ? '' : 's'} ago`
  if (s < 60) return 'just now'
  if (s < 3600) return n(s / 60, 'minute')
  if (s < 86400) return n(s / 3600, 'hour')
  if (s < 30 * 86400) return n(s / 86400, 'day')
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export const TEXT_EXT = ['.tex', '.bib', '.sty', '.cls', '.bst', '.txt', '.md', '.csv', '.dat', '.py', '.sh', '.cfg',
  '.json', '.yaml', '.yml', '.tikz', '.bbx', '.cbx', '.lua', '.r', '.m', '.gitignore', '.latexmkrc', '']
export const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp']

export function ext(name: string): string {
  const b = basename(name).toLowerCase()
  const dot = b.lastIndexOf('.')
  return dot > 0 ? b.slice(dot) : b.startsWith('.') ? b : ''
}
