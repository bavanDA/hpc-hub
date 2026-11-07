import type { Cluster } from '../../../types/clusters'
import { List } from '../../e/List'
import { ToggleRow } from '../../e/ToggleRow'
import { ASK } from '../ComputeDialog'
import { NodeFields } from '../node/NodeFields'

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
      <ToggleRow label={ASK} sub="Shows the node window when you connect." checked={d.ask_node ?? false}
        onChange={(on) => up({ ask_node: on })} />
      {reuse}
    </div>}
  </>
}
