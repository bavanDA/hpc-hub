import type { Cluster } from '../../../types/clusters'
import { Segments } from '../../e/ui'
import { PICKS, pickNote } from '../queuePick'
import { parseQueues } from '../queueList'

/** Cheapest or Fastest, shown only when there are several queues to pick from. */
export function QueuePick({ d, up }: { d: Cluster; up: (change: Partial<Cluster>) => void }) {
  if (parseQueues(d.queues ?? '').length < 2) return null
  return (
    <div className="px-5 pt-5">
      <Segments label="Pick the queue" value={d.queue_pick ?? 'cheapest'} options={PICKS}
        onChange={(queue_pick) => up({ queue_pick })} />
      <p className="pt-2 text-sm text-dim">{pickNote(d.queue_pick, d.queue_wait)}</p>
    </div>
  )
}
