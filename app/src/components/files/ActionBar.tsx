// Below the table: what you can do with the selected file or folder.
import { Copy, Download, FileArchive, FolderOpen, Package, Pencil, Trash2, type LucideIcon } from 'lucide-react'

import type { Entry } from '../../types/files'
import { isArchive } from './format'

export type Action = 'open' | 'download' | 'rename' | 'zip' | 'delete' | 'copy'

function Flat({ icon: Icon, label, disabled, onClick, danger = false }:
  { icon: LucideIcon; label: string; disabled: boolean; onClick: () => void; danger?: boolean }) {
  return (
    <button title={label} aria-label={label} disabled={disabled} onClick={onClick}
      className={`grid size-9 place-items-center rounded-md text-dim hover:bg-hover hover:text-text
        disabled:pointer-events-none disabled:opacity-35 ${danger ? 'hover:text-bad' : ''}`}>
      <Icon size={18} />
    </button>
  )
}

export function ActionBar({ entry, onAction }: { entry: Entry | null; onAction: (a: Action) => void }) {
  const none = entry === null
  const archive = entry !== null && isArchive(entry)
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-t border-line bg-window px-2">
      <Flat icon={FolderOpen} label="Open" disabled={none} onClick={() => onAction('open')} />
      <Flat icon={Download} label="Download" disabled={none} onClick={() => onAction('download')} />
      <Flat icon={Pencil} label="Rename" disabled={none} onClick={() => onAction('rename')} />
      <Flat icon={archive ? Package : FileArchive} label={archive ? 'Extract here' : 'Zip on the cluster'}
        disabled={none} onClick={() => onAction('zip')} />
      <Flat icon={Trash2} label="Delete" disabled={none} danger onClick={() => onAction('delete')} />
      <span className="min-w-0 flex-1 truncate px-2 text-sm text-dim">{entry?.name ?? ''}</span>
      <button disabled={none} onClick={() => onAction('copy')} title="Copy, then paste it on any cluster"
        className="flex h-9 items-center gap-2 rounded-lg border border-line-strong px-3.5 font-semibold
          hover:bg-hover active:bg-pressed disabled:pointer-events-none disabled:opacity-35">
        <Copy size={16} className="text-dim" /> Copy
      </button>
    </div>
  )
}
