// Files on the phone, inside scratch, when its last check found files about to be deleted: one row opens the plan.
// Same words as the backup screen: some files go on the first day, not "50,744 files tomorrow".
import { ArchiveRestore, ChevronRight } from 'lucide-react'

import { useScratchAlert } from '@shared/components/backup/alerts'
import { banner } from '@shared/components/backup/copy'
import { inScratch } from '@shared/components/backup/ScratchBanner'
import type { Place } from '@shared/types/files'
import { phone } from './words'

export function ScratchBanner({ cluster, path, places, onOpen }:
  { cluster: string; path: string; places: Place[]; onOpen: () => void }) {
  const alert = useScratchAlert(cluster)
  if (!alert || !inScratch(path, places)) return null
  return (
    <button onClick={onOpen} className="flex min-h-14 w-full items-center gap-3 rounded-[10px] border
      border-line-strong px-3.5 py-2 text-left active:bg-pressed">
      <ArchiveRestore size={20} className="shrink-0 text-dim" />
      <span className="min-w-0 flex-1">
        <span className="block">{phone.banner(alert.soonest_days)}</span>
        <span className="block text-sm text-dim">{banner.see}</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-dim" />
    </button>
  )
}
