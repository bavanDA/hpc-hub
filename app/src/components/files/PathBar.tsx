// Above the table: the cluster, Up / Home / Refresh / New folder, the path you can type into, and the places.
import { ArrowUp, ChevronDown, FolderPlus, HardDrive, House, PanelRight, RefreshCw, Upload, Zap } from 'lucide-react'
import { useState } from 'react'

import type { Cluster, Session } from '../../types'
import type { Place } from '../../types/files'
import { IconButton, Spinner } from '../ui'

type Props = {
  clusters: Cluster[]
  sessions: Record<string, Session>
  cluster: string
  onCluster: (id: string) => void
  path: string
  connected: boolean
  loading: boolean
  places: Place[]
  count: number | null
  preview: boolean
  onPreview: () => void
  onGo: (path: string) => void
  onUp: () => void
  onRefresh: () => void
  onNewFolder: () => void
  onUpload: () => void
}

export function PathBar(p: Props) {
  const [text, setText] = useState(p.path)
  const [was, setWas] = useState(p.path)
  if (was !== p.path) {  // a new folder opened: show its path
    setWas(p.path)
    setText(p.path)
  }
  const here = p.places.filter((pl) => p.path === pl.path || p.path.startsWith(pl.path + '/'))
    .sort((a, b) => b.path.length - a.path.length)[0]

  return (
    <div className="shrink-0 border-b border-line bg-window">
      <div className="flex items-center gap-1 px-2 pt-2">
        <div className="relative shrink-0">
          <select value={p.cluster} onChange={(e) => p.onCluster(e.target.value)} aria-label="Cluster"
            className="h-9 appearance-none rounded-md bg-pill pl-3 pr-8 font-bold outline-none hover:bg-selected
              focus-visible:ring-2 focus-visible:ring-accent">
            {p.clusters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{p.sessions[c.id]?.state === 'Connected' ? '' : ' (not connected)'}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
        </div>
        <div className="mx-1 h-5 w-px bg-line" />
        <IconButton icon={ArrowUp} label="Up" onClick={p.onUp} />
        <IconButton icon={House} label="Home" onClick={() => p.onGo('')} />
        <IconButton icon={RefreshCw} label="Refresh" onClick={p.onRefresh} />
        <div className="relative mx-1 min-w-0 flex-1">
          <input value={text} onChange={(e) => setText(e.target.value)} disabled={!p.connected}
            placeholder="/path" spellCheck={false} aria-label="Path"
            onKeyDown={(e) => {
              if (e.key === 'Enter') p.onGo(text.trim())
              if (e.key === 'Escape') { setText(p.path); e.currentTarget.blur() }
            }}
            className="h-9 w-full rounded-md bg-pill px-3 pr-9 font-mono text-[13px] outline-none select-text
              focus:bg-view focus:ring-2 focus:ring-accent disabled:opacity-50" />
          {p.loading && <span className="absolute right-2.5 top-1/2 -translate-y-1/2"><Spinner size={16} /></span>}
        </div>
        <IconButton icon={FolderPlus} label="New folder" onClick={p.onNewFolder} />
        <IconButton icon={Upload} label="Upload files here" onClick={p.onUpload} />
        <button onClick={p.onPreview} aria-label="Preview" title="Preview a file when you select it"
          aria-pressed={p.preview}
          className={`grid size-9 place-items-center rounded-full ${p.preview ? 'bg-selected' : 'hover:bg-hover'}`}>
          <PanelRight size={18} />
        </button>
      </div>
      {p.connected ? <div className="flex h-11 items-center gap-1.5 overflow-x-auto px-3">
        {p.places.map((pl) => {
          const Icon = pl.label === 'Home' ? House : pl.label.startsWith('Scratch') ? Zap : HardDrive
          const on = pl === here
          return (
            <button key={pl.path} onClick={() => p.onGo(pl.path)} title={pl.path}
              className={`flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold ${
                on ? 'bg-accent text-white' : 'bg-pill hover:bg-selected'}`}>
              <Icon size={14} /> {pl.label}
            </button>
          )
        })}
        <span className="ml-auto shrink-0 pl-2 text-[13px] text-dim">
          {p.count === null ? '' : p.count === 1 ? '1 item' : `${p.count} items`}
        </span>
      </div> : <div className="h-2" />}
    </div>
  )
}
