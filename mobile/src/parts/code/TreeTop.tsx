// Over the file tree and the start view: the cluster (the desktop's picker) and Go to file.
import { FolderSearch, X } from 'lucide-react'

import { ClusterPicker } from '@shared/components/clusters/ClusterPicker'
import { IconButton } from '@shared/components/ui/IconButton'

export function TreeTop({ canGoTo, onGoTo, onClose }: { canGoTo: boolean; onGoTo: () => void; onClose?: () => void }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
      <ClusterPicker />
      <span className="flex-1" />
      <IconButton icon={FolderSearch} label="Go to file" className="!size-8" disabled={!canGoTo} onClick={onGoTo} />
      {onClose && <IconButton icon={X} label="Close" className="!size-8" onClick={onClose} />}
    </div>
  )
}
