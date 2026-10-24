// After Copy: what is waiting to be pasted, like Adwaita's banner.
import { ClipboardPaste, X } from 'lucide-react'

import type { Clip } from '../../types/files'

export function ClipBanner({ clip, canPaste, onPaste, onDrop }:
  { clip: Clip; canPaste: boolean; onPaste: () => void; onDrop: () => void }) {
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-3 bg-accent/15 px-4 py-1.5">
      <p className="min-w-0 flex-1 text-center text-[14px]">
        Copied <b>{clip.name}</b> from {clip.clusterName}. Open any folder on any cluster, then paste.
      </p>
      <button onClick={onPaste} disabled={!canPaste}
        className="flex h-8 shrink-0 items-center gap-2 rounded-md bg-accent px-3 font-bold text-white
          hover:brightness-110 disabled:opacity-50">
        <ClipboardPaste size={16} /> Paste here
      </button>
      <button onClick={onDrop} aria-label="Forget the copy" title="Forget the copy"
        className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-hover"><X size={16} /></button>
    </div>
  )
}
