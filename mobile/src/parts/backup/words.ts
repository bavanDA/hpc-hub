// The phone's banner line in Files, where it differs from @shared/components/backup/copy: some files go on the first
// day, not "50,744 files tomorrow".
import { when } from '@shared/components/backup/format'

export const phone = {
  banner: (soonest: number) => `Some scratch files go ${when(soonest)}.`,
}
