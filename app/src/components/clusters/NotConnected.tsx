// What a page shows for a cluster that isn't connected: say so, and connect right here instead of sending you to
// the Clusters page. The same switch question as the cluster card when another cluster holds the only VPN.
import { Unplug } from 'lucide-react'
import { useState } from 'react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import { BUSY, type Cluster, type Session } from '../../types/clusters'
import { useToast } from '../toast'
import { Button, Dialog, EmptyState, Spinner } from '../ui'

type Switch = { id: string; name: string }

export function NotConnected({ cluster, session, what }: { cluster: Cluster; session?: Session; what: string }) {
  const toast = useToast()
  const go = useGo()
  const [swap, setSwap] = useState<Switch | null>(null)
  const busy = !!session && BUSY.includes(session.state)
  const dropped = session?.state === 'Error' && session.detail === 'Connection lost'

  const connect = async (force = false) => {
    try {
      const r = await call<{ switch?: Switch } | null>('clusters.connect', { cluster: cluster.id, switch: force })
      if (r?.switch) setSwap(r.switch)
    } catch (e) {
      const msg = (e as Error).message
      toast(msg, msg.includes('ettings') ? { kind: 'error', action: { label: 'Open Clusters', run: () => go('clusters') } }
        : { kind: 'error' })
    }
  }

  let body
  if (busy) {
    body = <EmptyState icon={Unplug} title={`Connecting to ${cluster.name}`} text={session?.detail || session?.state}
      action={<Button onClick={() => call('clusters.cancel', { cluster: cluster.id }).catch(() => {})}>
        <Spinner size={14} />Cancel</Button>} />
  } else if (dropped) {
    body = <EmptyState icon={Unplug} title={`${cluster.name} dropped`}
      text="The connection was lost, for example after the laptop slept."
      action={<Button kind="primary" onClick={() => connect()}>Reconnect</Button>} />
  } else {
    body = <EmptyState icon={Unplug} title={`${cluster.name} is not connected`} text={`Connect to see its ${what}.`}
      action={<Button kind="primary" onClick={() => connect()}>Connect</Button>} />
  }
  return (
    <>
      {body}
      {swap && (
        <Dialog title={`Disconnect ${swap.name}?`} onClose={() => setSwap(null)} width={420} actions={<>
          <Button onClick={() => setSwap(null)}>Cancel</Button>
          <Button kind="danger-solid" onClick={() => { setSwap(null); connect(true) }}>Switch to {cluster.name}</Button>
        </>}>
          <p className="text-dim">
            Only one VPN can run at a time. {swap.name} will be disconnected and its compute node ended.</p>
        </Dialog>
      )}
    </>
  )
}
