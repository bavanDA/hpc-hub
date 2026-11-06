// Real work never falls back to the shared login node: it asks for a compute node first.
import { useEffect, useState } from 'react'

import type { Cluster } from '../../types/clusters'
import { load, useClusters } from './store'

const nodeWords = () => ({
  title: 'You need a compute node to do this',
  confirm: 'Get a compute node',
  keep: 'Not now',
})

type Asking = { cluster: Cluster; what: string; run: () => void; detail?: string }

/** guard(cluster, 'The PDF build', run) runs it now when there is a node (or no connection, so the call says why),
 *  else asks for a node and runs it once the node is there. */
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

  const guard = (id: string, what: string, run: () => void, detail?: string) => {
    const s = sessions[id], c = clusters?.find((x) => x.id === id)
    if (!c || !s?.connected || s.node) return run()
    setAsking({ cluster: c, what, run, detail })
  }
  return {
    guard, getting, waiting: waiting?.what ?? null,
    words: asking && (asking.detail ? { ...nodeWords(), text: asking.detail } : nodeWords()),
    getNode: () => { setGetting(asking?.cluster ?? null); setWaiting(asking) },
    runHere: () => setAsking(null),  // Not now: nothing runs on the login node
    close: () => setAsking(null),
    closeNode: () => setGetting(null),
  }
}
