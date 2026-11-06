import { ChevronDown, ChevronRight, ChevronsUpDown, FileText, MessageCircleQuestion, StickyNote } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import type { Changes } from '../../../../types/history'
import { Switch } from '../../../ui'
import { fileName, plural } from '../format'
import { Counts } from '../ui/Counts'
import { Segments } from '../ui/Segments'
import { FileRows } from './FileRows'
import { movesOf } from './pieces'
import type { Asking, Layout, PutBack, Target } from './types'

type Props = {
  changes: Changes
  layout: Layout
  onLayout: (l: Layout) => void
  sides?: [ReactNode, ReactNode]  // Before ... | After ... over the two columns
  note?: ReactNode  // left of the layout switch ("Build files are left out")
  onOpen?: (path: string, line: number) => void  // Open file
  onPutBack?: (p: PutBack) => void
  onMore?: () => void  // the unchanged lines between changes: ask for them
  asking?: Asking
}

export function DiffView({ changes, layout, onLayout, sides, note, onOpen, onPutBack, onMore, asking }: Props) {
  const [moved, setMoved] = useState(true)
  const [closed, setClosed] = useState<Set<string>>(new Set())
  const box = useRef<HTMLDivElement>(null)
  const files = changes.files
  const hasMoves = changes.moves.length > 0
  const many = files.length >= 4
  const toFile = (path: string) => box.current?.querySelector(`[data-file="${CSS.escape(path)}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  const toLine = (path: string, line: number) => {
    const el = box.current?.querySelector(`[data-file="${CSS.escape(path)}"] [data-n="${line}"]`)
      ?? box.current?.querySelector(`[data-file="${CSS.escape(path)}"] [data-o="${line}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  const toggle = (p: string) => setClosed((c) => { const n = new Set(c); if (n.has(p)) n.delete(p); else n.add(p); return n })
  const [picked, setPicked] = useState<{ t: Target; x: number; y: number } | null>(null)
  useEffect(() => {
    if (!picked) return
    const off = () => setPicked(null)
    const el = box.current
    el?.addEventListener('scroll', off)
    return () => el?.removeEventListener('scroll', off)
  }, [picked])
  // selected text: Ask about it or note it
  const select = () => {
    const sel = window.getSelection()
    const text = sel?.toString().trim() ?? ''
    if (!asking || !sel || !text || !sel.rangeCount || !box.current?.contains(sel.anchorNode)) { setPicked(null); return }
    const el = (n: Node | null) => (n instanceof Element ? n : n?.parentElement) ?? null
    const a = el(sel.anchorNode), b = el(sel.focusNode)
    const file = b?.closest<HTMLElement>('[data-file]')?.dataset.file
    const anchor = b?.closest<HTMLElement>('[data-anchor]')?.dataset.anchor ?? a?.closest<HTMLElement>('[data-anchor]')?.dataset.anchor
    if (!file || !anchor) { setPicked(null); return }
    const num = (x: Element | null) => Number(x?.closest<HTMLElement>('[data-n]')?.dataset.n ?? 0)
    const lines = [num(a), num(b)].filter(Boolean)
    if (!lines.length) lines.push(Number(/#n(\d+)$/.exec(anchor)?.[1] ?? 1))
    const r = sel.getRangeAt(0).getBoundingClientRect()
    setPicked({ t: { path: file, line: Math.min(...lines), end: Math.max(...lines), diff: '', text: text.slice(0, 2000), anchor },
    x: r.left + r.width / 2, y: r.bottom + 6 })
  }

  if (!files.length) return <p className="px-6 py-10 text-center text-dim">No changes in the files.</p>
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-11 shrink-0 flex-wrap items-center gap-1.5 border-b border-line px-4 py-1.5">
        {many ? <span className="text-sm text-dim">Every file in the change, one after another</span>
          : files.map((f, i) => (
            <button key={f.path} onClick={() => toFile(f.path)} title={f.path}
              className={`flex h-7 items-center gap-1.5 rounded-md px-2 font-mono text-[13px] ${i === 0 && files.length > 1
                ? 'bg-pill font-semibold' : files.length === 1 ? 'bg-pill font-semibold' : 'text-dim hover:bg-hover'}`}>
              {files.length === 1 && <FileText size={13} />} {files.length === 1 ? f.path : fileName(f.path)}
              {f.binary ? <span className="text-xs">binary</span> : <Counts added={f.added} removed={f.removed} />}
              {movesOf(changes.moves, f.path) && <span className="font-sans text-xs text-dim">
                {movesOf(changes.moves, f.path)}</span>}
            </button>
          ))}
        <span className="flex-1" />
        {note && <span className="text-xs text-dim">{note}</span>}
        {many && <button onClick={() => setClosed(closed.size ? new Set() : new Set(files.map((f) => f.path)))}
          className="flex h-7 items-center gap-1 rounded-md px-2 text-sm text-dim hover:bg-hover">
          <ChevronsUpDown size={14} /> {closed.size ? 'Open all' : 'Collapse all'}</button>}
        {hasMoves && <label className="flex items-center gap-2 text-sm text-dim">
          <Switch on={moved} onChange={setMoved} label="Find moved text" /> Find moved text</label>}
        <Segments value={layout} onChange={onLayout} options={[['split', 'Side by side'], ['inline', 'Inline']]} />
      </div>
      <div className="flex min-h-0 flex-1">
        {many && (
          <div className="w-[220px] shrink-0 overflow-y-auto border-r border-line p-2">
            <div className="px-2 pt-1 pb-2 text-xs font-semibold text-dim">{plural(files.length, 'file')} changed</div>
            {files.map((f) => (
              <button key={f.path} onClick={() => toFile(f.path)} title={f.path}
                className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left font-mono text-[13px] hover:bg-hover">
                <FileText size={13} className="shrink-0 text-dim" />
                <span className="min-w-0 flex-1 truncate">{fileName(f.path)}</span>
                <Counts added={f.added} removed={f.removed} />
              </button>
            ))}
          </div>
        )}
        <div ref={box} className="min-w-0 flex-1 overflow-auto select-text" onMouseUp={() => setTimeout(select, 0)}>
          {sides && layout === 'split' && (
            <div className="sticky top-0 z-[3] grid grid-cols-2 border-b border-line bg-window text-sm text-dim">
              <div className="flex h-8 items-center gap-2 border-r border-line px-4">{sides[0]}</div>
              <div className="flex h-8 items-center gap-2 px-4">{sides[1]}</div>
            </div>
          )}
          {files.map((f) => (
            <section key={f.path} data-file={f.path}>
              {(files.length > 1 || many) && (
                <div className={`sticky z-[2] flex h-9 items-center gap-2 border-y border-line bg-window px-3 text-sm
                  ${sides && layout === 'split' ? 'top-8' : 'top-0'}`}>
                  <button onClick={() => toggle(f.path)} aria-label={closed.has(f.path) ? 'Open' : 'Collapse'}
                    className="grid size-6 place-items-center rounded text-dim hover:bg-hover">
                    {closed.has(f.path) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>
                  <span className="font-mono font-semibold">{f.path}</span>
                  {f.status === 'A' && <span className="text-xs text-dim">new file</span>}
                  {f.status === 'D' && <span className="text-xs text-dim">deleted</span>}
                  {f.status === 'R' && <span className="text-xs text-dim">renamed from {f.old_path}</span>}
                  <Counts added={f.added} removed={f.removed} />
                  <span className="flex-1" />
                  {onOpen && f.status !== 'D' && <button onClick={() => onOpen(f.path, f.hunks[0]?.new ?? 1)}
                    className="flex h-7 items-center gap-1.5 rounded-md px-2 text-dim hover:bg-hover hover:text-text">
                    <FileText size={13} /> Open file</button>}
                </div>
              )}
              {!closed.has(f.path) && (f.binary
                ? <p className="px-4 py-3 text-sm text-dim">A binary file: no lines to show.</p>
                : <FileRows file={f} layout={layout} moved={moved} moves={changes.moves} onMore={onMore}
                    onGo={toLine} onPutBack={onPutBack} asking={asking} />)}
            </section>
          ))}
          {changes.truncated && <p className="px-4 py-3 text-sm text-dim">This change is very large: only the start
            is shown.</p>}
          <div className="h-16" />
        </div>
      </div>
      {picked && asking && (
        <div style={{ left: picked.x, top: picked.y }} onMouseDown={(e) => e.preventDefault()}
          className="menu-in fixed z-30 flex -translate-x-1/2 gap-0.5 rounded-lg border border-line bg-raised p-1 shadow-md">
          <button onClick={() => { asking.onAsk(picked.t); setPicked(null) }}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold hover:bg-hover">
            <MessageCircleQuestion size={14} /> Ask about the selected text</button>
          <button onClick={() => { asking.onNote(picked.t); setPicked(null) }}
            className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold hover:bg-hover">
            <StickyNote size={14} /> Note</button>
        </div>
      )}
    </div>
  )
}
