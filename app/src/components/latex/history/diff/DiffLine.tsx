import type { Row } from '../../../../types/history'
import { Tex } from './Tex'

export function DiffLine({ row, side, inline, moved }: { row: Row; side?: 'o' | 'n'; inline?: boolean; moved?: boolean }) {
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
