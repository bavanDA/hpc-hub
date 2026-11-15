import { Copy, Download, FileArchive, FolderInput, FolderOpen, Package, Pencil, Trash2 } from 'lucide-react'

import type { Entry } from '../../types/files'
import { FlatButton } from './FlatButton'
import { isArchive } from './format'

export type Action = 'open' | 'download' | 'rename' | 'zip' | 'delete' | 'copy' | 'move'

/** What to do with the picked rows; open, rename and zip take one. */
export function ActionBar({ picked, onAction }: { picked: Entry[]; onAction: (a: Action) => void }) {
  const none = picked.length === 0
  const one = picked.length === 1 ? picked[0] : null
  const archive = one !== null && isArchive(one)
  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-t border-line bg-window px-2">
      <FlatButton icon={FolderOpen} label="Open" disabled={!one} onClick={() => onAction('open')} />
      <FlatButton icon={Download} label="Download" disabled={none} onClick={() => onAction('download')} />
      <FlatButton icon={Pencil} label="Rename" disabled={!one} onClick={() => onAction('rename')} />
      <FlatButton icon={archive ? Package : FileArchive} label={archive ? 'Extract here' : 'Zip on the cluster'}
        disabled={!one} onClick={() => onAction('zip')} />
      <FlatButton icon={Trash2} label="Delete" disabled={none} danger onClick={() => onAction('delete')} />
      <span className="min-w-0 flex-1 truncate px-2 text-sm text-dim">
        {one ? one.name : none ? '' : `${picked.length} selected`}</span>
      <Pill icon={FolderInput} label="Move" disabled={none} title="Move, then paste it in another folder (Ctrl+X)"
        onClick={() => onAction('move')} />
      <Pill icon={Copy} label="Copy" disabled={none} title="Copy, then paste it on any cluster (Ctrl+C)"
        onClick={() => onAction('copy')} />
    </div>
  )
}

function Pill({ icon: Icon, label, ...props }:
  React.ButtonHTMLAttributes<HTMLButtonElement> & { icon: typeof Copy; label: string }) {
  return (
    <button {...props}
      className="flex h-9 items-center gap-2 rounded-lg border border-line-strong px-3.5 font-semibold
        hover:bg-hover active:bg-pressed disabled:pointer-events-none disabled:opacity-35">
      <Icon size={16} className="text-dim" /> {label}
    </button>
  )
}
