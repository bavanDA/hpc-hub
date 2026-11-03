// Real work (a LaTeX build, a script) asks first when the cluster has no compute node, because it would run on the
// shared login node: get a node, or run there anyway. The window is each app's own (AskForNode.tsx here and in
// mobile/src/parts); what it asks and when is here, so both say the same thing.
import { useEffect, useState } from 'react'

import type { Cluster } from '../../types/clusters'
import { load, useClusters } from './store'

const fine = new Set<string>()  // cluster:what you said to run on the login node, until the app restarts

/** What the window says. */
export const nodeWords = (what: string) => ({
  title: 'No compute node yet',
  text: `${what} works better on a compute node. Get one first?`,
  confirm: 'Get a compute node',
  keep: 'Run on the login node',
})

type Asking = { cluster: Cluster; what: string; run: () => void }

/** guard(cluster, 'Building the PDF', run): runs it now with a node (or when not connected: the call says why),
 *  else asks. getting is the cluster whose node window to show (ComputeDialog, NodeSheet). */
export function useNodeFirst() {
  const { clusters, sessions } = useClusters()
  const [asking, setAsking] = useState<Asking | null>(null)
  const [getting, setGetting] = useState<Cluster | null>(null)
  useEffect(load, [])

  const guard = (id: string, what: string, run: () => void) => {
    const s = sessions[id], c = clusters?.find((x) => x.id === id)
    if (!c || !s?.connected || s.node || fine.has(`${id}:${what}`)) return run()
    setAsking({ cluster: c, what, run })
  }
  return {
    guard, getting,
    words: asking && nodeWords(asking.what),
    getNode: () => setGetting(asking?.cluster ?? null),
    runHere: () => { if (asking) { fine.add(`${asking.cluster.id}:${asking.what}`); asking.run() } },
    close: () => setAsking(null),
    closeNode: () => setGetting(null),
  }
}
