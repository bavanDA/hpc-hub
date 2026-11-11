// The changes as text: the desktop's rows (latex/history/diff/pieces), with the narrow gutters of the phone design. A
// tap on a changed line offers Ask and Note for that block.
import { ArrowDown, ArrowUp, ChevronsUpDown, MessageCircleQuestion, StickyNote, Undo2, X } from 'lucide-react'
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'

import { fileName, plural } from '@shared/components/latex/history/format'
import { movesOf, pieces, type Piece } from '@shared/components/latex/history/diff/pieces'
import { Tex } from '@shared/components/latex/history/diff/Tex'
import type { Layout, PutBack, Target } from '@shared/components/latex/history/diff/types'
import { Counts } from '@shared/components/latex/history/ui/Counts'
import type { Changes, FileDiff, Move, Row } from '@shared/types/history'
import { Segments } from '../../../ui'

type Props = {
  changes: Changes
  layout: Layout
  onLayout: (l: Layout) => void
  note?: ReactNode  // "Build files are left out"
  onMore?: () => void  // the unchanged lines between changes: ask for them
  onOpen?: (path: string, line: number) => void
  onPutBack?: (p: PutBack) => void
  onAsk?: (t: Target) => void
  onNote?: (t: Target) => void
}

export function DiffRows({ changes, layout, onLayout, note, onMore, onOpen, onPutBack, onAsk, onNote }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState<string>('')
  const toFile = (path: string) => box.current?.querySelector(`[data-file="${CSS.escape(path)}"]`)
    ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  const toLine = (path: string, line: number) => {
    const file = box.current?.querySelector(`[data-file="${CSS.escape(path)}"]`)
    ;(file?.querySelector(`[data-n="${line}"]`) ?? file?.querySelector(`[data-o="${line}"]`))
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }
  if (!changes.files.length) return <p className="px-5 py-10 text-center text-dim">No changes in the files.</p>
  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-2">
        <Segments fit value={layout} onChange={onLayout} options={[['split', 'Side by side'], ['inline', 'Inline']]} />
        <span className="flex-1" />
        {note && <span className="text-xs text-dim">{note}</span>}
      </div>
      <div className="flex gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
        {changes.files.map((f) => (
          <button key={f.path} onClick={() => toFile(f.path)} title={f.path}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1.5 font-mono text-xs font-semibold active:bg-pressed">
            {fileName(f.path)}
            {f.binary ? <span className="font-sans text-xs font-normal text-dim">binary</span>
              : <Counts added={f.added} removed={f.removed} className="font-normal" />}
            {movesOf(changes.moves, f.path) && <span className="font-sans text-xs font-normal text-dim">
              {movesOf(changes.moves, f.path)}</span>}
          </button>
        ))}
      </div>
      <div ref={box} className="bg-view pb-3">
        {changes.files.map((f) => (
          <section key={f.path} data-file={f.path}>
            {changes.files.length > 1 && (
              <div className="flex h-8 items-center gap-2 border-y border-line bg-window px-3 text-xs">
                <span className="min-w-0 flex-1 truncate font-mono font-semibold">{f.path}</span>
                {f.status === 'A' && <span className="text-dim">new file</span>}
                {f.status === 'D' && <span className="text-dim">deleted</span>}
                {f.status === 'R' && <span className="truncate text-dim">renamed from {f.old_path}</span>}
                {onOpen && f.status !== 'D' && <button onClick={() => onOpen(f.path, f.hunks[0]?.new ?? 1)}
                  className="rounded-md px-1.5 py-1 font-semibold active:bg-pressed">Open file</button>}
              </div>
            )}
            {f.binary ? <p className="px-4 py-3 text-sm text-dim">A binary file: no lines to show.</p>
              : <FileRows file={f} layout={layout} moves={changes.moves} onMore={onMore} onGo={toLine} onPutBack={onPutBack}
                  picked={picked} onPick={setPicked} onAsk={onAsk} onNote={onNote} />}
          </section>
        ))}
        {changes.truncated && <p className="px-4 py-3 text-sm text-dim">This change is very large: only the start is shown.</p>}
      </div>
    </div>
  )
}

function FileRows({ file, layout, moves, onMore, onGo, onPutBack, picked, onPick, onAsk, onNote }: {
  file: FileDiff; layout: Layout; moves: Move[]; onMore?: () => void; onGo: (path: string, line: number) => void
  onPutBack?: (p: PutBack) => void; picked: string; onPick: (anchor: string) => void; onAsk?: (t: Target) => void
  onNote?: (t: Target) => void
}) {
  const list = useMemo(() => pieces(file, layout, true, moves, !!onPutBack), [file, layout, moves, onPutBack])
  const bar = (p: Extract<Piece, { kind: 'row' }>, i: number) => {
    if (!p.blk || p.blk.anchor !== picked || !onAsk) return null
    const next = list[i + 1]
    if (next?.kind === 'row' && next.blk?.anchor === picked) return null  // shown after the last line of the block
    return (
      <div className="flex items-center justify-end gap-1 bg-inset py-1 pr-1 font-sans">
        <button onClick={() => { onPick(''); onAsk(p.blk!) }}
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold active:bg-pressed">
          <MessageCircleQuestion size={14} /> Ask</button>
        {onNote && <button onClick={() => { onPick(''); onNote(p.blk!) }}
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-sm font-semibold active:bg-pressed">
          <StickyNote size={14} /> Note</button>}
        <button aria-label="Close" onClick={() => onPick('')}
          className="grid size-8 place-items-center rounded-md text-dim active:bg-pressed"><X size={14} /></button>
      </div>
    )
  }
  return (
    <div className="font-mono text-xs leading-[18px]">
      {list.map((p, i) => (
        <Fragment key={i}>
          <PieceRow p={p} layout={layout} onMore={onMore} onGo={onGo} onPutBack={onPutBack}
            onTap={p.kind === 'row' && p.blk && onAsk ? () => onPick(p.blk!.anchor === picked ? '' : p.blk!.anchor) : undefined} />
          {p.kind === 'row' && bar(p, i)}
        </Fragment>
      ))}
    </div>
  )
}

const Band = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-8 items-center gap-2 border-y border-line bg-inset px-3 py-1 font-sans text-xs">{children}</div>
)

function PieceRow({ p, layout, onMore, onGo, onPutBack, onTap }: { p: Piece; layout: Layout; onMore?: () => void
  onGo: (path: string, line: number) => void; onPutBack?: (b: PutBack) => void; onTap?: () => void }) {
  if (p.kind === 'gap') {
    return <button onClick={onMore} disabled={!onMore}
      className="flex h-8 w-full items-center gap-2 border-y border-line bg-inset px-3 font-sans text-xs text-dim enabled:active:text-text">
      <ChevronsUpDown size={13} /> {plural(p.lines, 'unchanged line')}</button>
  }
  if (p.kind === 'moved-out') {
    return <Band><ArrowUp size={13} className="shrink-0 text-dim" /><b>{plural(p.rows.length, 'line')} moved</b>
      <span className="min-w-0 flex-1 truncate text-dim">to {fileName(p.move.to.path)}, line {p.move.to.line}</span>
      <button onClick={() => onGo(p.move.to.path, p.move.to.line)} className="shrink-0 font-semibold text-dim">Go to them</button></Band>
  }
  if (p.kind === 'moved-in') {
    const m = p.move
    return <Band><ArrowDown size={13} className="shrink-0 text-dim" /><b>Moved here</b>
      <span className="min-w-0 flex-1 truncate text-dim">from {fileName(m.from.path)}, lines {m.from.line} to {m.from.end}
        {m.changes ? ` · ${plural(m.changes, 'change')} inside` : ', unchanged'}</span>
      <button onClick={() => onGo(m.from.path, m.from.line)} className="shrink-0 font-semibold text-dim">Go to where it was</button></Band>
  }
  if (p.kind === 'back') {
    return <div className="py-1 pl-14">
      <button onClick={() => onPutBack?.(p.put)} className="flex h-8 items-center gap-1.5 rounded-md bg-pill px-2.5 font-sans
        text-sm font-semibold active:bg-pressed"><Undo2 size={13} /> {p.put.lines.length > 1 ? 'Put these lines back' : 'Put this line back'}</button>
    </div>
  }
  if (layout === 'inline') {
    const r = p.both ?? p.left ?? p.right!
    return <div onClick={onTap}><Line row={r} /></div>
  }
  const left = p.both ?? p.left, right = p.both ?? p.right
  return (
    <div className="grid grid-cols-2" onClick={onTap}>
      <div className="min-w-0 border-r border-line">{left ? <Line row={left} side="o" /> : null}</div>
      <div className="min-w-0">{right ? <Line row={right} side="n" /> : null}</div>
    </div>
  )
}

function Line({ row, side }: { row: Row; side?: 'o' | 'n' }) {
  const tone = row.k === '-' ? 'diff-del' : row.k === '+' ? 'diff-add' : ''
  const ink = row.k === '-' ? 'diff-del-ink' : row.k === '+' ? 'diff-add-ink' : 'text-faint'
  const mark = row.k === '-' ? 'diff-del-mark' : 'diff-add-mark'
  // the design's two narrow columns: a number and +/- (or the other number for an unchanged line)
  const first = side === 'o' ? row.o : side === 'n' ? row.n : row.k === '+' ? row.n : row.o
  const second = side ? null : row.k === ' ' ? row.n : row.k
  return (
    <div data-o={row.o ?? undefined} data-n={row.n ?? undefined} className={`flex min-w-0 ${tone}`}>
      <span className={`w-9 shrink-0 pr-1.5 text-right select-none ${ink}`}>{first ?? ''}</span>
      {!side && <span className={`w-7 shrink-0 pr-1.5 text-right select-none ${ink}`}>{second ?? ''}</span>}
      <span className="min-w-0 flex-1 pr-3 break-words whitespace-pre-wrap"><Tex text={row.t} marks={row.m} markClass={mark} /></span>
    </div>
  )
}
