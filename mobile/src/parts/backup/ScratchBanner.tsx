// Files on the phone, inside scratch, when its last check found files about to be deleted: one tap opens the plan.
import { ArchiveRestore, ChevronRight } from 'lucide-react'

import { useScratchAlert } from '@shared/components/backup/alerts'
import { banner } from '@shared/components/backup/copy'
import { inScratch } from '@shared/components/backup/ScratchBanner'
import type { Place } from '@shared/types/files'

export function ScratchBanner({ cluster, path, places, onOpen }:
  { cluster: string; path: string; places: Place[]; onOpen: () => void }) {
  const alert = useScratchAlert(cluster)
  if (!alert || !inScratch(path, places)) return null
  return (
    <button onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 rounded-xl bg-warn-bg px-3 py-2
      text-left text-warn active:brightness-95">
      <ArchiveRestore size={20} className="shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{banner.files(alert.files, alert.soonest_days)}</span>
        <span className="block text-sm font-bold">{banner.see}</span>
      </span>
      <ChevronRight size={20} className="shrink-0" />
    </button>
  )
}
