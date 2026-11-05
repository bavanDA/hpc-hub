// A change in the LaTeX: side by side or inline, every file one after another, the changed words marked, and text
// that moved shown as one moved block with only its real change marked (rows come marked from the backend).
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown, FileText, Undo2 } from 'lucide-react'
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'

import type { Changes, FileDiff, Move, Row } from '../../../types/history'
import { Switch } from '../../ui'
import { Counts, fileName, plural, Segments } from './bits'

export type Layout = 'split' | 'inline'
/** A change block that can go back: its lines now (n from `line`) become the old ones. */
export type PutBack = { path: string; line: number; expect: string[]; lines: string[] }

type Props = {
  changes: Changes
  layout: Layout
  onLayout: (l: Layout) => void
  sides?: [ReactNode, ReactNode]  // Before ... | After ... over the two columns
  note?: ReactNode  // left of the layout switch ("Build files are left out")
  onOpen?: (path: string, line: number) => void  // Open file
  onPutBack?: (p: PutBack) => void
  onMore?: () => void  // the unchanged lines between changes: ask for them
}

export function DiffView({ changes, layout, onLayout, sides, note, onOpen, onPutBack, onMore }: Props) {
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
        <div ref={box} className="min-w-0 flex-1 overflow-auto select-text">
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
                    onGo={toLine} onPutBack={onPutBack} />)}
            </section>
          ))}
          {changes.truncated && <p className="px-4 py-3 text-sm text-dim">This change is very large: only the start
            is shown.</p>}
          <div className="h-16" />
        </div>
      </div>
    </div>
  )
}

function movesOf(moves: Move[], path: string): string {
  const into = moves.filter((m) => m.to.path === path).reduce((n, m) => n + m.lines, 0)
  const out = moves.filter((m) => m.from.path === path).reduce((n, m) => n + m.lines, 0)
  return [into && `${into} moved in`, out && `${out} moved out`].filter(Boolean).join(' · ')
}

// -- one file -----------------------------------------------------------------------------------------------------
type Piece = { kind: 'gap'; lines: number } | { kind: 'row'; left?: Row; right?: Row; both?: Row }
  | { kind: 'moved-out'; move: Move; rows: Row[] } | { kind: 'moved-in'; move: Move }
  | { kind: 'back'; put: PutBack }

function pieces(f: FileDiff, layout: Layout, moved: boolean, moves: Move[], putBack: boolean): Piece[] {
  const out: Piece[] = []
  let lastOld = 0
  f.hunks.forEach((h, hi) => {
    const gap = h.old - 1 - lastOld
    if (gap > 0 && !(hi === 0 && f.status === 'A')) out.push({ kind: 'gap', lines: gap })
    lastOld = h.old - 1 + h.rows.filter((r) => r.k !== '+' && !r.src).length
    // without "Find moved text" a move is a plain delete and add
    const rows: Row[] = moved ? h.rows : h.rows.filter((r) => !r.src)
      .map((r) => r.mv ? { ...r, mv: undefined, same: false, o: r.k === '+' ? null : r.o } : r)
    const out_ = (r: Row) => !!r.mv && r.k === '-' && !r.src
    let i = 0, ctx: Row | null = null
    while (i < rows.length) {
      const r = rows[i]
      if (out_(r)) {  // moved away: one line saying where to
        const run: Row[] = []
        while (i < rows.length && rows[i].mv === r.mv && out_(rows[i])) run.push(rows[i++])
        out.push({ kind: 'moved-out', move: moves.find((m) => m.id === r.mv)!, rows: run })
        continue
      }
      if (r.mv && rows[i - 1]?.mv !== r.mv) out.push({ kind: 'moved-in', move: moves.find((m) => m.id === r.mv)! })
      if (r.k === ' ' || r.same) { out.push({ kind: 'row', both: r }); ctx = r; i++; continue }
      const old: Row[] = [], now: Row[] = []
      while (i < rows.length && rows[i].k !== ' ' && !rows[i].same && !out_(rows[i]) && rows[i].mv === r.mv) {
        if (rows[i].k === '-') old.push(rows[i])
        else now.push(rows[i])
        i++
      }
      if (layout === 'split') {
        for (let k = 0; k < Math.max(old.length, now.length); k++) out.push({ kind: 'row', left: old[k], right: now[k] })
      } else {
        old.forEach((x) => out.push({ kind: 'row', left: x }))
        now.forEach((x) => out.push({ kind: 'row', right: x }))
      }
      if (putBack && !r.mv) {
        const line = now[0]?.n ?? ((ctx?.n ?? h.new - 1) + 1)
        out.push({ kind: 'back', put: { path: f.path, line, expect: now.map((x) => x.t), lines: old.map((x) => x.t) } })
      }
    }
  })
  return out
}

function FileRows({ file, layout, moved, moves, onMore, onGo, onPutBack }:
  { file: FileDiff; layout: Layout; moved: boolean; moves: Move[]; onMore?: () => void
    onGo: (path: string, line: number) => void; onPutBack?: (p: PutBack) => void }) {
  const list = useMemo(() => pieces(file, layout, moved, moves, !!onPutBack), [file, layout, moved, moves, onPutBack])
  const cols = layout === 'split' ? 'grid-cols-2' : 'grid-cols-1'
  return (
    <div className="font-mono text-[13px] leading-[19px]">
      {list.map((p, i) => {
        if (p.kind === 'gap') {
          return (
            <button key={i} onClick={onMore} disabled={!onMore}
              className="flex h-8 w-full items-center gap-2 border-y border-line bg-inset px-4 font-sans text-sm text-dim
                enabled:hover:text-text">
              <ChevronsUpDown size={13} /> {plural(p.lines, 'unchanged line')}</button>
          )
        }
        if (p.kind === 'moved-out') {
          return (
            <div key={i} className="flex h-8 items-center gap-2 border-y border-line bg-inset px-4 font-sans text-sm">
              <ArrowUp size={14} className="text-dim" />
              <span className="font-semibold">{plural(p.rows.length, 'line')} moved</span>
              <span className="text-dim">to {fileName(p.move.to.path)}, line {p.move.to.line}</span>
              <button onClick={() => onGo(p.move.to.path, p.move.to.line)}
                className="ml-2 rounded px-1.5 text-dim hover:bg-hover hover:text-text">Go to them</button>
            </div>
          )
        }
        if (p.kind === 'moved-in') {
          const m = p.move
          return (
            <div key={i} className="flex h-8 items-center gap-2 border-y border-line bg-inset px-4 font-sans text-sm">
              <ArrowDown size={14} className="text-dim" />
              <span className="font-semibold">Moved here</span>
              <span className="text-dim">from {fileName(m.from.path)}, lines {m.from.line} to {m.from.end}
                {m.changes ? ` · ${plural(m.changes, 'change')} inside` : ', unchanged'}</span>
              <span className="flex-1" />
              <button onClick={() => onGo(m.from.path, m.from.line)}
                className="rounded px-1.5 text-dim hover:bg-hover hover:text-text">Go to where it was</button>
            </div>
          )
        }
        if (p.kind === 'back') {
          return (
            <div key={i} className={`grid ${cols}`}>
              {layout === 'split' && <div className="border-r border-line" />}
              <div className="px-12 py-1">
                <button onClick={() => onPutBack?.(p.put)}
                  className="flex h-7 items-center gap-1.5 rounded-md bg-pill px-2.5 font-sans text-sm font-semibold
                    hover:bg-pressed">
                  <Undo2 size={13} /> {p.put.lines.length > 1 ? 'Put these lines back' : 'Put this line back'}</button>
              </div>
            </div>
          )
        }
        if (layout === 'inline') {
          const r = p.both ?? p.left ?? p.right!
          return <Line key={i} row={r} inline moved={!!p.both?.same} />
        }
        if (p.both) {
          return (
            <div key={i} className="grid grid-cols-2">
              <Line row={p.both} side="o" moved={!!p.both.same} />
              <Line row={p.both} side="n" moved={!!p.both.same} />
            </div>
          )
        }
        return (
          <div key={i} className="grid grid-cols-2">
            {p.left ? <Line row={p.left} side="o" /> : <div className="border-r border-line bg-inset/40" />}
            {p.right ? <Line row={p.right} side="n" /> : <div className="bg-inset/40" />}
          </div>
        )
      })}
    </div>
  )
}

function Line({ row, side, inline, moved }: { row: Row; side?: 'o' | 'n'; inline?: boolean; moved?: boolean }) {
  const tone = row.k === '-' ? 'diff-del' : row.k === '+' ? 'diff-add' : ''
  const num = row.k === '-' ? 'diff-del-ink' : row.k === '+' ? 'diff-add-ink' : 'text-faint'
  const mark = row.k === '-' ? 'diff-del-mark' : 'diff-add-mark'
  const at = side === 'o' ? row.o : side === 'n' ? row.n : null
  return (
    <div data-o={row.o ?? undefined} data-n={row.n ?? undefined}
      className={`flex min-w-0 ${tone} ${side === 'o' ? 'border-r border-line' : ''}
        ${moved ? 'border-l-2 border-l-dim/40' : ''}`}>
      {inline ? <>
        <span className={`w-11 shrink-0 pr-2 text-right select-none ${num}`}>{row.o ?? ''}</span>
        <span className={`w-11 shrink-0 pr-2 text-right select-none ${num}`}>{row.n ?? ''}</span>
        <span className={`w-5 shrink-0 select-none ${num}`}>{moved ? '›' : row.k === ' ' ? '' : row.k}</span>
      </> : <span className={`w-12 shrink-0 pr-3 text-right select-none ${num}`}>{at ?? ''}</span>}
      <span className="min-w-0 flex-1 pr-4 break-words whitespace-pre-wrap">
        <Tex text={row.t} marks={row.m} markClass={mark} /></span>
    </div>
  )
}

const TOKEN = /(\\[A-Za-z@]+|\\.|[{}]|%.*$|\$)/g

/** LaTeX with commands, braces and comments in color, and changed words marked. */
export function Tex({ text, marks = [], markClass = '' }: { text: string; marks?: [number, number][]; markClass?: string }) {
  if (!text) return <>{' '}</>
  const cuts = new Set([0, text.length, ...marks.flat()])
  const edges = [...cuts].sort((a, b) => a - b)
  return <>{edges.slice(0, -1).map((a, i) => {
    const b = edges[i + 1]
    const marked = marks.some(([x, y]) => a >= x && b <= y)
    const part = text.slice(a, b)
    const inner = part.split(TOKEN).map((t, k) => !t ? null
      : t.startsWith('\\') ? <span key={k} className="text-accent-text">{t}</span>
      : t === '{' || t === '}' ? <span key={k} className="text-dim">{t}</span>
      : t.startsWith('%') ? <span key={k} className="text-faint italic">{t}</span>
      : t === '$' ? <span key={k} className="text-orange">{t}</span>
      : <Fragment key={k}>{t}</Fragment>)
    return marked ? <mark key={a} className={`text-inherit ${markClass}`}>{inner}</mark> : <Fragment key={a}>{inner}</Fragment>
  })}</>
}
