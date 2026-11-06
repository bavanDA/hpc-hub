import { Copy, Download, FileArchive, FolderOpen, Package, Pencil, Trash2 } from 'lucide-react'

import type { Entry } from '../../types/files'
import { FlatButton } from './FlatButton'
import { isArchive } from './format'

export type Action = 'open' | 'download' | 'rename' | 'zip' | 'delete' | 'copy'

export function ActionBar({ entry, onAction }: { entry: Entry | null; onAction: (a: Action) => void }) {
  const none = entry === null
  const archive = entry !== null && isArchive(entry)
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-t border-line bg-window px-2">
      <FlatButton icon={FolderOpen} label="Open" disabled={none} onClick={() => onAction('open')} />
      <FlatButton icon={Download} label="Download" disabled={none} onClick={() => onAction('download')} />
      <FlatButton icon={Pencil} label="Rename" disabled={none} onClick={() => onAction('rename')} />
      <FlatButton icon={archive ? Package : FileArchive} label={archive ? 'Extract here' : 'Zip on the cluster'}
        disabled={none} onClick={() => onAction('zip')} />
      <FlatButton icon={Trash2} label="Delete" disabled={none} danger onClick={() => onAction('delete')} />
      <span className="min-w-0 flex-1 truncate px-2 text-sm text-dim">{entry?.name ?? ''}</span>
      <button disabled={none} onClick={() => onAction('copy')} title="Copy, then paste it on any cluster"
        className="flex h-9 items-center gap-2 rounded-lg border border-line-strong px-3.5 font-semibold
          hover:bg-hover active:bg-pressed disabled:pointer-events-none disabled:opacity-35">
        <Copy size={16} className="text-dim" /> Copy
      </button>
    </div>
  )
}
