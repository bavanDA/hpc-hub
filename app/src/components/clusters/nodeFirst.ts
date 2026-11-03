// The login node is for signing in, asking for a node, and checking and editing files (the owner's rule). So
// anything that runs (a terminal, a LaTeX build, a script, Read aloud) asks you to get a compute node first, every
// time, and doesn't run on the login node. The window is each app's
// own (AskForNode.tsx here and in mobile/src/parts); what it asks and when is here, so both say the same.
import { useEffect, useState } from 'react'

import type { Cluster } from '../../types/clusters'
import { load, useClusters } from './store'

/** What the window says. */
export const nodeWords = (what: string) => ({
  title: 'No compute node yet',
  text: `${what} needs a compute node. The login node is only for signing in, asking for a node and editing files.`,
  confirm: 'Get a compute node',
  keep: 'Not now',
})

type Asking = { cluster: Cluster; what: string; run: () => void }

/** guard(cluster, 'Building the PDF', run): runs it now with a node (or when not connected: the call says why),
 *  else asks you to get one and runs it once the node is there. getting is the cluster whose node window to show
 *  (ComputeDialog, NodeSheet). */
export function useNodeFirst() {
  const { clusters, sessions } = useClusters()
  const [asking, setAsking] = useState<Asking | null>(null)
  const [getting, setGetting] = useState<Cluster | null>(null)
  const [waiting, setWaiting] = useState<Asking | null>(null)  // asked for a node: runs once it is there
  useEffect(load, [])
  useEffect(() => {
    if (waiting && sessions[waiting.cluster.id]?.node) {
      setWaiting(null)
      waiting.run()
    }
  }, [waiting, sessions])

  const guard = (id: string, what: string, run: () => void) => {
    const s = sessions[id], c = clusters?.find((x) => x.id === id)
    if (!c || !s?.connected || s.node) return run()
    setAsking({ cluster: c, what, run })
  }
  return {
    guard, getting,
    words: asking && nodeWords(asking.what),
    getNode: () => { setGetting(asking?.cluster ?? null); setWaiting(asking) },
    runHere: () => setAsking(null),  // Not now: nothing runs on the login node
    close: () => setAsking(null),
    closeNode: () => setGetting(null),
  }
}
