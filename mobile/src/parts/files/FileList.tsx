// The desktop's file table on a phone: tap a folder to open it, tap a file to select it for the action bar (tap it
// again to open it). A long press is the desktop's right-click menu, on a row or the empty space under the rows.
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useRef } from 'react'

import { FileIcon } from '@shared/components/files/FileIcon'
import { isDir, size, when } from '@shared/components/files/format'
import type { Entry, Sort, SortKey } from '@shared/types/files'

const COLUMNS: [SortKey, string, string][] = [
  ['name', 'Name', 'min-w-0 flex-1'], ['size', 'Size', 'w-[68px] justify-end'], ['mtime', 'Modified', 'w-20 justify-end'],
]

/** A long press (half a second without moving) calls onLong instead of the tap. */
function useLongPress(onLong: () => void) {
  const timer = useRef<number>(0)
  const fired = useRef(false)
  const clear = () => window.clearTimeout(timer.current)
  return {
    fired,
    handlers: {
      onPointerDown: () => {
        fired.current = false
        clear()
        timer.current = window.setTimeout(() => { fired.current = true; navigator.vibrate?.(15); onLong() }, 500)
      },
      onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear, onPointerMove: (e: React.PointerEvent) => {
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clear()
      },
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); fired.current = true; onLong() },
    },
  }
}

function FileRow({ entry: e, on, onTap, onMenu }: { entry: Entry; on: boolean; onTap: () => void; onMenu: () => void }) {
  const press = useLongPress(onMenu)
  return (
    <div {...press.handlers} data-selected={on} onClick={() => !press.fired.current && onTap()}
      className={`flex min-h-11 items-center gap-3 border-b border-line pr-3 pl-4 active:bg-pressed ${
        on ? 'bg-selected' : ''}`}>
      <FileIcon entry={e} />
      <span className="min-w-0 flex-1 truncate">{e.name}</span>
      <span className="w-[68px] shrink-0 text-right text-sm text-dim tabular-nums">{isDir(e) ? '' : size(e.size)}</span>
      <span className="w-20 shrink-0 text-right text-xs text-dim tabular-nums">{when(e.mtime)}</span>
    </div>
  )
}

/** A long press on something that isn't a list: the folder's own menu. */
export const useFolderPress = (onMenu: () => void) => useLongPress(onMenu).handlers

export function FileList({ entries, sort, onSort, selected, onSelect, onOpen, onMenu }: {
  entries: Entry[]; sort: Sort; onSort: (s: Sort) => void; selected: string | null; onSelect: (name: string) => void
  onOpen: (e: Entry) => void; onMenu: (e: Entry | null) => void
}) {
  const background = useLongPress(() => onMenu(null))
  // only the space under the rows: a row's own press bubbles up here
  const under = Object.fromEntries(Object.entries(background.handlers).map(([k, fn]) => [k,
    (e: React.SyntheticEvent) => { if (e.target === e.currentTarget) (fn as (ev: React.SyntheticEvent) => void)(e) }]))
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-3 border-b border-line pr-3 pl-4 text-xs font-semibold text-dim">
        <span className="w-5 shrink-0" />
        {COLUMNS.map(([k, title, cls]) => (
          <button key={k} type="button" onClick={() => onSort({ key: k, desc: sort.key === k ? !sort.desc : false })}
            className={`flex h-full items-center gap-1 ${cls} ${sort.key === k ? 'text-text' : ''}`}>
            {title}{sort.key === k && (sort.desc ? <ChevronDown size={14} /> : <ChevronUp size={14} />)}
          </button>
        ))}
      </div>
      <div {...under} className="min-h-0 flex-1 overflow-y-auto">
        {entries.map((e) => <FileRow key={e.name} entry={e} on={e.name === selected}
          onTap={() => (isDir(e) || e.name === selected ? onOpen(e) : onSelect(e.name))}
          onMenu={() => { onSelect(e.name); onMenu(e) }} />)}
      </div>
    </div>
  )
}
