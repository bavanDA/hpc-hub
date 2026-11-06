import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from 'react'

import type { Entry, Sort, SortKey } from '../../types/files'
import { FileIcon } from './FileIcon'
import { isDir, size, when } from './format'

const COLUMNS: [SortKey, string, string][] = [
  ['name', 'Name', 'flex-1 min-w-0'], ['size', 'Size', 'w-24 justify-end'], ['mtime', 'Modified', 'w-36'],
]

type Props = {
  entries: Entry[]
  sort: Sort
  onSort: (s: Sort) => void
  selected: string | null
  onSelect: (name: string | null) => void
  onOpen: (e: Entry) => void
  onMenu: (e: Entry | null, x: number, y: number) => void
  onKey: (key: string, e: Entry | null) => boolean
}

export function FileTable({ entries, sort, onSort, selected, onSelect, onOpen, onMenu, onKey }: Props) {
  const body = useRef<HTMLDivElement>(null)

  useEffect(() => {  // keep the selected row in view when the keyboard moves it
    body.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const key = (ev: KeyboardEvent) => {
    const i = entries.findIndex((e) => e.name === selected)
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault()
      const next = ev.key === 'ArrowDown' ? Math.min(entries.length - 1, i + 1) : Math.max(0, i - 1)
      if (entries[next]) onSelect(entries[next].name)
      return
    }
    if (onKey(ev.key, entries[i] ?? null)) ev.preventDefault()
  }

  const menu = (ev: MouseEvent, e: Entry | null) => {
    ev.preventDefault()
    ev.stopPropagation()
    onSelect(e?.name ?? null)
    onMenu(e, ev.clientX, ev.clientY)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col outline-none" tabIndex={0} onKeyDown={key}>
      <div className="flex h-9 shrink-0 items-center gap-4 border-b border-line px-4 text-xs font-semibold text-dim">
        <div className="w-5" />
        {COLUMNS.map(([k, title, cls]) => (
          <button key={k} onClick={() => onSort({ key: k, desc: sort.key === k ? !sort.desc : false })}
            className={`flex h-full items-center gap-1 hover:text-text ${cls} ${sort.key === k ? 'text-text' : ''}`}>
            {title}
            {sort.key === k && (sort.desc ? <ChevronDown size={14} /> : <ChevronUp size={14} />)}
          </button>
        ))}
      </div>
      <div ref={body} className="min-h-0 flex-1 overflow-auto" onClick={() => onSelect(null)}
        onContextMenu={(ev) => menu(ev, null)}>
        {entries.map((e) => {
          const on = e.name === selected
          return (
            <div key={e.name} data-selected={on}
              onClick={(ev) => { ev.stopPropagation(); onSelect(e.name) }}
              onDoubleClick={() => onOpen(e)} onContextMenu={(ev) => menu(ev, e)}
              className={`flex h-11 items-center gap-4 border-b border-line px-4 ${
                on ? 'bg-selected' : 'hover:bg-hover'}`}>
              <FileIcon entry={e} />
              <span className="min-w-0 flex-1 truncate">{e.name}</span>
              <span className="w-24 text-right text-sm tabular-nums text-dim">{isDir(e) ? '' : size(e.size)}</span>
              <span className="w-36 text-sm tabular-nums text-dim">{when(e.mtime)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
