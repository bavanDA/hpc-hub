// One card per cluster, like the GTK app's (cluster_card.py): status, connect, compute node, Open, log.
import { Info, Settings } from 'lucide-react'
import { useState } from 'react'

import { call } from '../rpc'
import { BUSY, DUO, summary, type Cluster, type Session } from '../types/clusters'
import { AuthenticatorHelp } from './clusters/AuthenticatorHelp'
import { ComputeDialog } from './clusters/ComputeDialog'
import { LogView } from './clusters/LogView'
import { OpenMenu } from './clusters/OpenMenu'
import { ServerIcon } from './clusters/ServerIcon'
import { SettingsDialog } from './clusters/SettingsDialog'
import { putCluster } from './clusters/store'
import { useToast } from './toast'
import { Button, Dialog, IconButton, Spinner } from './ui'

const PILL: Record<string, string> = {
  Connected: 'bg-ok-bg text-ok', Error: 'bg-bad-bg text-bad', Disconnected: 'bg-pill text-dim',
}

type Open = null | 'settings' | 'compute' | 'help' | { switch: { id: string; name: string }; vpnOnly: boolean }

export function ClusterCard({ cluster: c, session: s, log }: { cluster: Cluster; session: Session; log: string[] }) {
  const toast = useToast()
  const [open, setOpen] = useState<Open>(null)
  const [hint, setHint] = useState('')
  const busy = BUSY.includes(s.state)
  const idle = s.state === 'Disconnected' || s.state === 'Error'
  const connected = s.connected ?? s.state === 'Connected'

  const run = (method: string, params: Record<string, unknown> = {}) =>
    call(method, { cluster: c.id, ...params }).catch((e: Error) => toast(e.message))

  async function connect(vpnOnly = false, swap = false) {
    try {
      const r = await call<{ switch?: { id: string; name: string } } | null>('clusters.connect',
        { cluster: c.id, vpn_only: vpnOnly, switch: swap })
      if (r?.switch) setOpen({ switch: r.switch, vpnOnly })
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('settings')) { setHint(msg); setOpen('settings') } else toast(msg)
    }
  }

  function action() {
    if (busy) run('clusters.cancel')
    else if (s.state === 'Connected') run('clusters.disconnect')
    else connect()
  }

  async function wantNode(on: boolean) {
    try {
      putCluster(await call<Cluster>('clusters.update', { cluster: c.id, changes: { request_node_on_connect: on } }))
    } catch (e) {
      toast((e as Error).message)
    }
  }

  const a = s.node ? s : null
  const actionLook = s.state === 'Connected' ? 'destructive' : busy ? 'pill' : 'suggested'
  return (
    <section className="flex flex-col gap-1.5 rounded-xl bg-card p-[18px] shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3">
        <ServerIcon />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight">{c.name}</h2>
          <p className="text-[13px] text-dim">
            {c.host || 'no host set'} · {c.vpn.enabled ? `VPN ${c.vpn.gateway || '(gateway not set)'}` : 'no VPN'}
          </p>
        </div>
        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-bold ${
          PILL[s.state] ?? 'bg-warn-bg text-warn'}`}>{s.state === DUO ? 'Duo' : s.state}</span>
        <IconButton icon={Settings} label="Settings" onClick={() => { setHint(''); setOpen('settings') }} />
        {c.vpn.enabled && idle && (
          <Button round className="px-5" title="Just the VPN tunnel, no SSH or compute node"
            onClick={() => connect(true)}>VPN only</Button>
        )}
        {c.second_factor === 'code' && idle && (
          <IconButton icon={Info} label="How to set up Google Authenticator" onClick={() => setOpen('help')} />
        )}
        <Button round kind={actionLook} disabled={s.state === 'Disconnecting'} onClick={action}
          className="min-w-[120px] px-6">
          {s.state === 'Disconnecting' ? 'Disconnecting…' : busy ? 'Cancel'
            : s.state === 'Connected' ? 'Disconnect' : s.state === 'Error' ? 'Reconnect' : 'Connect'}
        </Button>
      </div>

      {idle && (
        <label className="mt-1.5 flex w-fit items-center gap-2.5 pl-1"
          title="Ask Slurm for a compute node when you connect">
          <input type="checkbox" checked={c.request_node_on_connect ?? true}
            onChange={(e) => wantNode(e.target.checked)}
            className="size-[18px] accent-[var(--color-accent)]" />
          Compute node on connect: {summary(c.profile)}
        </label>
      )}

      {(busy || s.detail) && (
        <div className="flex items-center gap-2 py-1">
          {busy && <Spinner />}
          {s.detail && <span className={`min-w-0 break-words ${s.state === DUO ? 'font-bold text-accent-text' : ''}`}>
            {s.detail}</span>}
        </div>
      )}

      {connected && (
        <div className="mt-1 flex items-center gap-3">
          <span className="flex-1 select-text font-bold">
            {a ? `Node ${a.node} · Job ${a.job}${a.owned ? '' : ' (your job)'}` : 'No compute node'}
          </span>
          {a
            ? <Button round onClick={() => run('clusters.release_node')}
                title={a.owned ? 'Cancel this job, stay connected' : 'Keep the job running, just stop using it here'}>
                {a.owned ? 'Release node' : 'Stop using'}</Button>
            : <Button round onClick={() => setOpen('compute')} title={`Request ${summary(c.profile)}`}
                disabled={busy}>Get node</Button>}
        </div>
      )}
      {connected && <div className="mt-2"><OpenMenu /></div>}

      <div className="mt-1"><LogView lines={log} /></div>

      {open === 'settings' && <SettingsDialog cluster={c} hint={hint} onClose={() => setOpen(null)} />}
      {open === 'compute' && <ComputeDialog cluster={c} onClose={() => setOpen(null)} />}
      {open === 'help' && <AuthenticatorHelp cluster={c} onClose={() => setOpen(null)} />}
      {open && typeof open === 'object' && (
        <Dialog title={`Disconnect ${open.switch.name}?`} onClose={() => setOpen(null)} width={420}
          actions={<>
            <Button onClick={() => setOpen(null)}>Cancel</Button>
            <Button kind="destructive" onClick={() => { setOpen(null); connect(open.vpnOnly, true) }}>
              Switch to {c.name}</Button>
          </>}>
          <p className="text-center text-dim">
            Split tunnel is off, so only one VPN can run. {open.switch.name} will be disconnected and its compute
            node released.</p>
        </Dialog>
      )}
    </section>
  )
}
