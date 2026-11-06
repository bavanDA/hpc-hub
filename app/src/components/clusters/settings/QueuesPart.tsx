import type { Cluster } from '../../../types/clusters'
import { List } from '../../e/List'
import { NumberRow } from '../../e/NumberRow'
import { QueueRows } from '../QueueRows'
import { QueuePick } from './QueuePick'

export function QueuesPart({ d, up }: { d: Cluster; up: (change: Partial<Cluster>) => void }) {
  return <>
    <h3 className="px-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Tried in this order</h3>
    <QueueRows cluster={d.id} value={d.queues ?? ''} onChange={(queues) => up({ queues })} />
    <p className="px-5 pt-2 text-sm text-dim">Cheapest first. Slurm says how long each would wait right now, nothing
      is sent.</p>
    <QueuePick d={d} up={up} />
    {d.queue_pick !== 'fastest' && <div className="pt-5"><List>
      <NumberRow label="Wait for a cheaper queue" unit="seconds" min={0} max={3600} value={d.queue_wait ?? 60}
        onChange={(queue_wait) => up({ queue_wait })} />
    </List></div>}
  </>
}
