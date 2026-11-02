// After Copy: what is waiting to be pasted, in a grey band; Paste here is the main button then.
import { ClipboardPaste, X } from 'lucide-react'

import type { Clip } from '../../types/files'

export function ClipBanner({ clip, canPaste, onPaste, onDrop }:
  { clip: Clip; canPaste: boolean; onPaste: () => void; onDrop: () => void }) {
  return (
    <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-line bg-soft px-4 py-1.5">
      <p className="min-w-0 flex-1 text-base">
        Copied <b>{clip.name}</b> from {clip.clusterName}. Open any folder on any cluster, then paste.
      </p>
      <button onClick={onPaste} disabled={!canPaste}
        className="flex h-9 shrink-0 items-center gap-2 rounded-lg bg-accent px-3.5 font-semibold text-on-accent
          hover:bg-accent-hover disabled:opacity-40">
        <ClipboardPaste size={16} /> Paste here
      </button>
      <button onClick={onDrop} aria-label="Forget the copy" title="Forget the copy"
        className="grid size-8 shrink-0 place-items-center rounded-md text-dim hover:bg-hover hover:text-text">
        <X size={16} /></button>
    </div>
  )
}
