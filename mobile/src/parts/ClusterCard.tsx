// One cluster on the phone: state, Connect (or QR code: scan the desktop's login, then connect), the compute
// node, login and log.
import { KeyRound, ScanQrCode, Zap } from 'lucide-react'
import { useState } from 'react'

import { LogView } from '@shared/components/clusters/LogView'
import { putCluster } from '@shared/components/clusters/store'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import { BUSY, DUO, fastLabel, summary, type Cluster, type Session } from '@shared/types/clusters'
import { Button, Card, Switch, useToast } from '../ui'
import { LoginSheet } from './LoginSheet'
import { NodeSheet } from './NodeSheet'
import { scanPairing } from './scanPairing'

const PILL: Record<string, string> = {
  Connected: 'bg-ok-bg text-ok', Error: 'bg-bad-bg text-bad', Disconnected: 'bg-pill text-dim',
}

export function ClusterCard({ cluster: c, session: s, log }: { cluster: Cluster; session: Session; log: string[] }) {
  const toast = useToast()
  const [open, setOpen] = useState<'' | 'login' | 'node'>('')
  const [hint, setHint] = useState('')
  const busy = BUSY.includes(s.state)
  const idle = s.state === 'Disconnected' || s.state === 'Error'
  const connected = s.connected ?? s.state === 'Connected'
  const run = (method: string) => call(method, { cluster: c.id }).catch((e: Error) => toast(e.message))

  async function connect() {
    try {
      await call('clusters.connect', { cluster: c.id, switch: true })
    } catch (e) {
      const msg = (e as Error).message
      // the desktop's wording points at its settings dialog; here the login sheet is that place
      if (/username/i.test(msg)) { setHint('Add your username to connect.'); setOpen('login') } else toast(msg)
    }
  }

  async function scan() {
    const { msg, names } = await scanPairing()
    if (names.includes(c.name)) await connect()
    else if (msg) toast(msg)
  }

  async function wantNode(on: boolean) {
    try {
      putCluster(await call<Cluster>('clusters.update', { cluster: c.id, changes: { request_node_on_connect: on } }))
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const label = s.state === 'Disconnecting' ? 'Disconnecting' : busy ? 'Cancel'
    : connected ? 'Disconnect' : s.state === 'Error' ? 'Reconnect' : 'Connect'
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight">{c.name}</h2>
          <p className="truncate text-sm text-dim">{c.host || 'no host set'}</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${PILL[s.state] ?? 'bg-warn-bg text-warn'}`}>
          {s.state === DUO ? 'Duo' : s.state}</span>
        <button aria-label="Login" onClick={() => { setHint(''); setOpen('login') }}
          className="-mr-2 -mt-2 grid size-11 shrink-0 place-items-center rounded-full text-dim active:bg-hover">
          <KeyRound size={20} /></button>
      </div>

      {(busy || s.detail) && (
        <div className="flex items-center gap-2">
          {busy && <Spinner />}
          {s.detail && <span className={`min-w-0 break-words text-sm ${s.state === DUO ? 'font-bold text-accent-text'
            : ''}`}>{s.detail}</span>}
        </div>
      )}

      {connected && (
        <div className="rounded-xl bg-pill p-3">
          <p className="select-text font-bold">
            {s.node ? `Node ${s.node} · Job ${s.job}` : 'No compute node'}</p>
          <div className="mt-2 flex gap-2">
            {s.node
              ? <Button className="flex-1" onClick={() => run('clusters.release_node')}>
                  {s.owned ? 'Release node' : 'Stop using'}</Button>
              : <>
                  {fastLabel(c) && <Button className="flex-1" icon={Zap} disabled={busy}
                    onClick={() => run('clusters.request_fast_node')}>{fastLabel(c).replace('Fast node ', 'Fast ')}</Button>}
                  <Button className="flex-1" disabled={busy} onClick={() => setOpen('node')}>Get node</Button>
                </>}
          </div>
        </div>
      )}

      {idle && <Switch label="Compute node on connect" hint={summary(c.profile)}
        checked={c.request_node_on_connect ?? true} onChange={wantNode} />}

      <div className="flex gap-2">
        {idle && <Button icon={ScanQrCode} className="flex-1" onClick={scan}>QR code</Button>}
        <Button kind={connected ? 'danger' : busy ? 'plain' : 'primary'} className="flex-1"
          disabled={s.state === 'Disconnecting'}
          onClick={() => (busy ? run('clusters.cancel') : connected ? run('clusters.disconnect') : connect())}>
          {label}</Button>
      </div>

      <LogView lines={log} />

      {open === 'login' && <LoginSheet cluster={c} hint={hint} onClose={() => setOpen('')} />}
      {open === 'node' && <NodeSheet cluster={c} onClose={() => setOpen('')} />}
    </Card>
  )
}
