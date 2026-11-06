import type { Row } from '../../../../types/history'
import { Tex } from '../diff/Tex'

export function HoverLine({ label, row }: { label: string; row: Row }) {
  return (
    <div className="mb-1.5 flex items-start gap-2">
      <span className="w-11 shrink-0 pt-1 text-xs text-dim">{label}</span>
      <span className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 font-mono text-xs break-words whitespace-pre-wrap">
        <Tex text={row.t} marks={row.m} markClass={row.k === '-' ? 'diff-del-mark' : 'diff-add-mark'} /></span>
    </div>
  )
}
