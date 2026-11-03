// Ask for a compute node before real work runs on the login node (@shared nodeFirst.ts): const node =
// useAskForNode(); node.guard(cluster, 'Your script', run), and render {node.sheet}.
import { useNodeFirst } from '@shared/components/clusters/nodeFirst'
import { ConfirmSheet } from '../ui'
import { NodeSheet } from './NodeSheet'

export function useAskForNode() {
  const n = useNodeFirst()
  const sheet = <>
    {n.words && <ConfirmSheet {...n.words} onConfirm={n.getNode} onKeep={n.runHere} onClose={n.close} />}
    {n.getting && <NodeSheet cluster={n.getting} mode="request" onClose={n.closeNode} />}
  </>
  return { guard: n.guard, sheet }
}
