import { Unplug } from 'lucide-react'
import { useState } from 'react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import { BUSY, type Cluster, type Session } from '../../types/clusters'
import { AlertDialog, Button, EmptyState, Spinner } from '../ui'
import { useToast } from '../useToast'
import { shortName } from './loginCopy'

type Switch = { id: string; name: string }

export function NotConnected({ cluster, session, what, compact }:
  { cluster: Cluster; session?: Session; what: string; compact?: boolean }) {
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
  if (compact) {
    const name = shortName(cluster)
    body = (
      <div className="flex min-h-[52px] flex-wrap items-center gap-3 rounded-xl border border-line px-[18px] py-2.5">
        <span className="min-w-0 flex-1 text-dim">
          {busy ? `Connecting to ${name}…` : dropped ? `${name} dropped. Reconnect to see it.` : `Connect to see ${name}`}
        </span>
        {busy ? <Spinner size={14} /> : <Button size="sm" onClick={() => connect()}>{dropped ? 'Reconnect' : 'Connect'}</Button>}
      </div>
    )
  } else if (busy) {
    body = <EmptyState icon={Unplug} title={`Connecting to ${shortName(cluster)}`} text={session?.detail || session?.state}
      action={<Button onClick={() => call('clusters.cancel', { cluster: cluster.id }).catch(() => {})}>
        <Spinner size={14} />Stop signing in</Button>} />
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
        <AlertDialog title={`Disconnect ${shortName(swap)}?`} keep={`Stay on ${shortName(swap)}`}
          act={`Switch to ${shortName(cluster)}`} onClose={() => setSwap(null)}
          onAct={() => { setSwap(null); connect(true) }}>
          <p>Only one VPN can run at a time. {shortName(swap)} disconnects and its node is released.</p>
        </AlertDialog>
      )}
    </>
  )
}
