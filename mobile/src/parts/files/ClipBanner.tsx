// At the bottom of Files while something is copied: what, from where, Paste here and X to forget it.
import { ClipboardPaste, File, Folder, X } from 'lucide-react'

import type { Clip } from '@shared/types/files'
import { Button } from '../../ui'

export function ClipBanner({ clip, canPaste, onPaste, onDrop }:
  { clip: Clip; canPaste: boolean; onPaste: () => void; onDrop: () => void }) {
  const Icon = clip.folder ? Folder : File
  return (
    <div className="flex shrink-0 items-center gap-3 border-t border-line bg-raised px-4 py-2
      shadow-[var(--shadow-menu)]">
      <Icon size={22} className="shrink-0 text-accent-text" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{clip.name}</p>
        <p className="truncate text-sm text-dim">Copied from {clip.clusterName}</p>
      </div>
      <Button kind="primary" icon={ClipboardPaste} disabled={!canPaste} onClick={onPaste}>Paste here</Button>
      <button aria-label="Forget the copy" onClick={onDrop}
        className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-dim active:bg-hover">
        <X size={20} /></button>
    </div>
  )
}
