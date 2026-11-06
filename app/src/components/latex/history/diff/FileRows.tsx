import { ArrowDown, ArrowUp, ChevronsUpDown, MessageCircleQuestion, StickyNote, Undo2 } from 'lucide-react'
import { Fragment, type ReactNode, useMemo } from 'react'

import type { FileDiff, Move } from '../../../../types/history'
import { fileName, plural } from '../format'

import { DiffLine } from './DiffLine'
import { anchorOf, type Piece, pieces } from './pieces'
import type { Asking, Layout, PutBack, Target } from './types'

export function FileRows({ file, layout, moved, moves, onMore, onGo, onPutBack, asking }:
  { file: FileDiff; layout: Layout; moved: boolean; moves: Move[]; onMore?: () => void
    onGo: (path: string, line: number) => void; onPutBack?: (p: PutBack) => void; asking?: Asking }) {
  const list = useMemo(() => pieces(file, layout, moved, moves, !!onPutBack), [file, layout, moved, moves, onPutBack])
  const cols = layout === 'split' ? 'grid-cols-2' : 'grid-cols-1'
  return (
    <div className="font-mono text-[13px] leading-[19px]">
      {list.map((p, i) => {
        if (p.kind !== 'row' || !asking) return <Fragment key={i}>{piece(p, i)}</Fragment>
        const anchor = anchorOf(file.path, p)
        const n = (p.right ?? p.both)?.n
        const pins = n != null ? asking.pins(file.path, n) : []
        const first = p.blk && list[i - 1]?.kind === 'row' ? (list[i - 1] as { blk?: Target }).blk !== p.blk : !!p.blk
        return (
          <Fragment key={i}>
            <div data-anchor={anchor} className="group/row relative">
              {piece(p, i)}
              {pins.length > 0 && <span className="absolute top-0.5 left-0.5 flex gap-0.5">{pins.slice(0, 2).map((x) => (
                <span key={x.n} className={`note-pin grid size-4 place-items-center rounded-full font-sans text-[10px]
                  font-semibold ${x.done ? 'done' : ''}`}>{x.n}</span>))}</span>}
              {first && p.blk && (
                <span className="absolute top-0 right-2 z-[1] hidden gap-0.5 font-sans group-hover/row:flex">
                  <button onClick={() => asking.onAsk(p.blk!)} title="Ask the agent about this change"
                    className="flex h-[19px] items-center gap-1 rounded bg-raised px-1.5 text-xs font-semibold shadow-sm
                      ring-1 ring-line hover:bg-hover"><MessageCircleQuestion size={12} /> Ask</button>
                  <button onClick={() => asking.onNote(p.blk!)} title="Add a note on this line"
                    className="flex h-[19px] items-center gap-1 rounded bg-raised px-1.5 text-xs font-semibold shadow-sm
                      ring-1 ring-line hover:bg-hover"><StickyNote size={12} /> Note</button>
                </span>
              )}
            </div>
            {asking.under(anchor)}
          </Fragment>
        )
      })}
    </div>
  )

  function piece(p: Piece, i: number): ReactNode {
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
          return <DiffLine key={i} row={r} inline moved={!!p.both?.same} />
        }
        if (p.both) {
          return (
            <div key={i} className="grid grid-cols-2">
              <DiffLine row={p.both} side="o" moved={!!p.both.same} />
              <DiffLine row={p.both} side="n" moved={!!p.both.same} />
            </div>
          )
        }
        return (
          <div key={i} className="grid grid-cols-2">
            {p.left ? <DiffLine row={p.left} side="o" /> : <div className="border-r border-line bg-inset/40" />}
            {p.right ? <DiffLine row={p.right} side="n" /> : <div className="bg-inset/40" />}
          </div>
        )
  }
}
