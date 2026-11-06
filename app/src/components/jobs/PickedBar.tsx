import type { Job } from '../../types/jobs'
import { Button } from '../ui/Button'

export function PickedBar({ chosen, onClear, onCancel }: { chosen: Job[]; onClear: () => void; onCancel: () => void }) {
  const one = chosen.length === 1
  return (
    <div className="flex shrink-0 items-center gap-3 border-y border-line px-4 py-2">
      <span className="flex-1 font-medium">{chosen.length} {one ? 'job' : 'jobs'} picked</span>
      <Button onClick={onClear}>Clear</Button>
      <Button kind="danger-solid" onClick={onCancel}>{one ? 'Cancel job' : `Cancel ${chosen.length} jobs`}</Button>
    </div>
  )
}
