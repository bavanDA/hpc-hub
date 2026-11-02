// The open files as tabs: a dot for unsaved edits, middle click or the x to close.
import { X } from 'lucide-react'

import { isDirty, type OpenFile } from '../store'

export function Tabs({ files, current, clusterName, onPick, onClose }: {
  files: OpenFile[]
  current: string | null
  clusterName: (id: string) => string
  onPick: (key: string) => void
  onClose: (key: string) => void
}) {
  const clusters = new Set(files.map((f) => f.cluster))
  return (
    <div role="tablist" className="flex h-9 shrink-0 items-end overflow-x-auto border-b border-line bg-window px-1">
      {files.map((f) => {
        const on = f.key === current
        const dirty = isDirty(f)
        return (
          <div key={f.key} role="tab" aria-selected={on} title={`${clusterName(f.cluster)}: ${f.path}`}
            onClick={() => onPick(f.key)} onAuxClick={(e) => { if (e.button === 1) onClose(f.key) }}
            className={`group -mb-px flex h-9 max-w-[220px] shrink-0 cursor-pointer items-center gap-1.5 border-b-2 pr-1
              pl-3 text-sm transition-colors duration-90 ${on ? 'border-accent font-semibold'
              : 'border-transparent text-dim hover:bg-hover hover:text-text'}`}>
            <span className="truncate">{f.name}</span>
            {clusters.size > 1 && <span className="shrink-0 text-xs text-dim">{clusterName(f.cluster)}</span>}
            <button type="button" aria-label={`Close ${f.name}`} onClick={(e) => { e.stopPropagation(); onClose(f.key) }}
              className="grid size-5 shrink-0 place-items-center rounded hover:bg-hover">
              {dirty ? <span className="size-2 rounded-full bg-text group-hover:hidden" /> : null}
              <X size={14} className={dirty ? 'hidden group-hover:block' : on ? '' : 'opacity-0 group-hover:opacity-100'} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
