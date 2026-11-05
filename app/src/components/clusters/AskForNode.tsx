// Ask for a compute node before real work runs on the login node (nodeFirst.ts): const node = useAskForNode();
// node.guard(cluster, 'The PDF build', build), and render {node.dialog}.
import { ConfirmDialog } from '../e/parts'
import { ComputeDialog } from './ComputeDialog'
import { useNodeFirst } from './nodeFirst'

export function useAskForNode() {
  const n = useNodeFirst()
  const dialog = <>
    {n.words && <ConfirmDialog {...n.words} onConfirm={n.getNode} onKeep={n.runHere} onClose={n.close} />}
    {n.getting && <ComputeDialog cluster={n.getting} onClose={n.closeNode} />}
  </>
  return { guard: n.guard, waiting: n.waiting, dialog }
}
