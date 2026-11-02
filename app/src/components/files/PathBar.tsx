// Above the table: Up / Home / Refresh / New folder, the path you can type into, and the places. The cluster is
// picked in the header (clusters/ClusterPicker.tsx).
import { ArrowUp, FolderPlus, House, PanelRight, RefreshCw, Upload } from 'lucide-react'
import { useState } from 'react'

import type { Place } from '../../types/files'
import { Segments } from '../e/ui'
import { IconButton, Spinner } from '../ui'

type Props = {
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
            className="h-9 w-full rounded-lg bg-soft px-3 pr-9 font-mono text-sm outline-none select-text
              focus:ring-1 focus:ring-accent disabled:opacity-50" />
          {p.loading && <span className="absolute right-2.5 top-1/2 -translate-y-1/2"><Spinner size={16} /></span>}
        </div>
        <IconButton icon={FolderPlus} label="New folder" onClick={p.onNewFolder} />
        <IconButton icon={Upload} label="Upload files here" onClick={p.onUpload} />
        <button onClick={p.onPreview} aria-label="Preview" title="Preview a file when you select it"
          aria-pressed={p.preview}
          className={`grid size-9 place-items-center rounded-md ${p.preview ? 'bg-selected text-text'
            : 'text-dim hover:bg-hover hover:text-text'}`}>
          <PanelRight size={18} />
        </button>
      </div>
      {p.connected ? <div className="flex min-h-12 items-center gap-2 px-3 py-2">
        {p.places.length > 0 && <div className="min-w-0" style={{ width: p.places.length * 120 }}>
          <Segments label="Places" value={here?.path ?? ''} onChange={(path) => p.onGo(path)}
            options={p.places.map((pl) => [pl.path, pl.label] as const)} /></div>}
        <span className="ml-auto shrink-0 pl-2 text-sm text-dim">
          {p.count === null ? '' : p.count === 1 ? '1 item' : `${p.count} items`}
        </span>
      </div> : <div className="h-2" />}
    </div>
  )
}
