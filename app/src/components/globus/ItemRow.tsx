import { File, Folder } from 'lucide-react'

import type { Item } from '../../types/globus'
import { size } from '../files/format'
import { shortDate } from './format'

export function ItemRow({ it, selected, onSelect, onOpen }:
  { it: Item; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const Icon = it.is_dir ? Folder : File
  return (
    <div onClick={onSelect} onDoubleClick={onOpen}
      className={`grid min-h-10 grid-cols-[1fr_64px_96px] items-center gap-2 border-b border-line px-3 py-1.5
        @max-[400px]:grid-cols-[1fr_64px] ${
        selected ? 'bg-selected' : 'hover:bg-hover'}`}>
      <span className="flex min-w-0 items-center gap-2">
        <Icon size={16} className={`shrink-0 ${'text-dim'}`} />
        <span className="min-w-0 [overflow-wrap:anywhere]">{it.name}</span>
      </span>
      <span className="text-right text-sm tabular-nums text-dim">{it.is_dir ? '' : size(it.size)}</span>
      {/* a narrow side drops the date first, so names stay whole */}
      <span className="truncate text-sm tabular-nums text-dim @max-[400px]:hidden">{shortDate(it.modified)}</span>
    </div>
  )
}
