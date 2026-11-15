import { ChevronDown, ChevronUp } from 'lucide-react'
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent } from 'react'

import type { Entry, Sort, SortKey } from '../../types/files'
import { FileIcon } from './FileIcon'
import { isDir, size, when } from './format'
import { howOf, pick } from './selection'

const COLUMNS: [SortKey, string, string][] = [
  ['name', 'Name', 'flex-1 min-w-0'], ['size', 'Size', 'w-24 justify-end'], ['mtime', 'Modified', 'w-36'],
]
const DRAG = 'application/x-hpc-hub-files'  // rows dragged inside the table: their names

type Props = {
  entries: Entry[]
  sort: Sort
  onSort: (s: Sort) => void
  selected: string | null  // the row the keyboard is on, and where Shift picks from
  picked: Set<string>
  onPick: (picked: Set<string>, selected: string | null) => void
  onOpen: (e: Entry) => void
  onMenu: (e: Entry | null, x: number, y: number) => void
  onKey: (key: string, e: Entry | null) => boolean  // "Delete", "Ctrl+C"...
  onMoveInto: (names: string[], folder: Entry) => void
}

export function FileTable({ entries, sort, onSort, selected, picked, onPick, onOpen, onMenu, onKey, onMoveInto }: Props) {
  const body = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState<string | null>(null)  // the folder rows are being dragged onto
  const names = entries.map((e) => e.name)

  useEffect(() => {  // keep the selected row in view when the keyboard moves it
    body.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const key = (ev: KeyboardEvent) => {
    const i = entries.findIndex((e) => e.name === selected)
    const ctrl = ev.ctrlKey || ev.metaKey
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault()
      const next = entries[ev.key === 'ArrowDown' ? Math.min(entries.length - 1, i + 1) : Math.max(0, i - 1)]
      if (next) onPick(ev.shiftKey ? pick(names, picked, selected, next.name, 'range') : new Set([next.name]),
        ev.shiftKey ? selected : next.name)
      return
    }
    if (ctrl && ev.key.toLowerCase() === 'a') { ev.preventDefault(); onPick(new Set(names), selected); return }
    if (ev.key === 'Escape' && picked.size) { onPick(new Set(), null); return }
    const k = ctrl && ev.key.length === 1 ? `Ctrl+${ev.key.toUpperCase()}` : ev.key
    if (onKey(k, entries[i] ?? null)) ev.preventDefault()
  }

  const click = (ev: MouseEvent, e: Entry) => {
    ev.stopPropagation()
    const how = howOf(ev)
    onPick(pick(names, picked, selected, e.name, how), how === 'range' ? selected : e.name)
  }

  const menu = (ev: MouseEvent, e: Entry | null) => {
    ev.preventDefault()
    ev.stopPropagation()
    if (!e) onPick(new Set(), null)
    else if (!picked.has(e.name)) onPick(new Set([e.name]), e.name)  // a row outside the picked ones: just it
    onMenu(e, ev.clientX, ev.clientY)
  }

  const dragStart = (ev: DragEvent, e: Entry) => {
    const moving = picked.has(e.name) ? names.filter((n) => picked.has(n)) : [e.name]
    if (!picked.has(e.name)) onPick(new Set([e.name]), e.name)
    ev.dataTransfer.setData(DRAG, JSON.stringify(moving))
    ev.dataTransfer.effectAllowed = 'move'
  }
  const dragOver = (ev: DragEvent, e: Entry) => {
    if (!isDir(e) || !ev.dataTransfer.types.includes(DRAG) || picked.has(e.name)) return
    ev.preventDefault()
    ev.dataTransfer.dropEffect = 'move'
    setOver(e.name)
  }
  const drop = (ev: DragEvent, e: Entry) => {
    setOver(null)
    const raw = ev.dataTransfer.getData(DRAG)
    if (!raw || !isDir(e)) return
    ev.preventDefault()
    const moving = (JSON.parse(raw) as string[]).filter((n) => n !== e.name)
    if (moving.length) onMoveInto(moving, e)
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
      <div ref={body} className="min-h-0 flex-1 overflow-auto" onClick={() => onPick(new Set(), null)}
        onContextMenu={(ev) => menu(ev, null)}>
        {entries.map((e) => {
          const on = picked.has(e.name)
          return (
            <div key={e.name} data-selected={on} data-current={e.name === selected} aria-selected={on}
              draggable onDragStart={(ev) => dragStart(ev, e)} onDragOver={(ev) => dragOver(ev, e)}
              onDragLeave={() => setOver((o) => (o === e.name ? null : o))} onDrop={(ev) => drop(ev, e)}
              onDragEnd={() => setOver(null)}
              onClick={(ev) => click(ev, e)} onDoubleClick={() => onOpen(e)} onContextMenu={(ev) => menu(ev, e)}
              className={`flex h-11 items-center gap-4 border-b border-line px-4 select-none ${
                over === e.name ? 'bg-selected ring-2 ring-accent ring-inset'
                  : on ? 'bg-selected' : 'hover:bg-hover'}`}>
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
