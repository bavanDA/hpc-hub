// Files on the phone, inside scratch, when its last check found files about to be deleted: a plain row opens the plan.
// Same words as the backup screen: some files go on the first day, not "50,744 files tomorrow".
import { ArchiveRestore } from 'lucide-react'

import { useScratchAlert } from '@shared/components/backup/alerts'
import { banner } from '@shared/components/backup/copy'
import { inScratch } from '@shared/components/backup/plan'
import type { Place } from '@shared/types/files'
import { Row } from '../../ui'
import { phone } from './words'

export function ScratchBanner({ cluster, path, places, onOpen }:
  { cluster: string; path: string; places: Place[]; onOpen: () => void }) {
  const alert = useScratchAlert(cluster)
  if (!alert || !inScratch(path, places)) return null
  return (
    <div className="-mx-4 border-t border-line">
      <Row icon={ArchiveRestore} label={phone.banner(alert.soonest_days)} sub={banner.see} opens onPress={onOpen} />
    </div>
  )
}
