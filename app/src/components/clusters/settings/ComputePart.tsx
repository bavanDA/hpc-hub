import type { Cluster } from '../../../types/clusters'
import { NodeFields } from '../node/NodeFields'
import { List, ToggleRow } from '../../e/ui'
import { ASK } from '../ComputeDialog'
import { parseQueues } from '../queueList'
import { QueuePick } from './QueuePick'

export function ComputePart({ d, up }: { d: Cluster; up: (change: Partial<Cluster>) => void }) {
  const want = d.request_node_on_connect ?? true
  const reuse = <ToggleRow label="Reuse a node you already have" sub="One an agent or VS Code got earlier."
    checked={d.reuse_running_job ?? true} onChange={(on) => up({ reuse_running_job: on })} />
  return <>
    <List>
      <ToggleRow label="Get a compute node when I connect" sub="Your terminals and agents run there."
        checked={want} onChange={(on) => up({ request_node_on_connect: on })} />
      {!want && reuse}
    </List>
    {want && <div className="pt-5">
      <NodeFields cluster={d.id} value={d.profile} onChange={(profile) => up({ profile })} />
      {parseQueues(d.queues ?? '').length > 1 && <div className="pb-5"><QueuePick d={d} up={up} /></div>}
      <ToggleRow label={ASK} sub="Shows the node window when you connect." checked={d.ask_node ?? false}
        onChange={(on) => up({ ask_node: on })} />
      {reuse}
    </div>}
  </>
}
