// A line over Files while you are in scratch and its last check found files about to be deleted. Opens the plan.
import { ArchiveRestore } from 'lucide-react'

import type { Place } from '../../types/files'
import { useScratchAlert } from './alerts'
import { banner } from './copy'

/** True when path is in the cluster's scratch place (files.places labels it Scratch). */
export function inScratch(path: string, places: Place[]): boolean {
  return places.some((p) => /scratch/i.test(p.label) && (path === p.path || path.startsWith(`${p.path}/`)))
}

export function ScratchBanner({ cluster, path, places, onOpen }: {
  cluster: string; path: string; places: Place[]; onOpen: () => void
}) {
  const alert = useScratchAlert(cluster)
  if (!alert || !inScratch(path, places)) return null
  return (
    <div role="status" className="flex shrink-0 items-center gap-3 border-b border-line bg-warn-bg px-4 py-2 text-warn">
      <ArchiveRestore size={16} className="shrink-0" />
      <span className="min-w-0 flex-1 text-md">{banner.files(alert.files, alert.soonest_days)}</span>
      <button onClick={onOpen} className="shrink-0 rounded-md px-2 py-1 font-semibold hover:bg-warn/10">
        {banner.see}</button>
    </div>
  )
}
