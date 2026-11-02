// One card per cluster, like the GTK app's (cluster_card.py). The status says where you are; the main button is
// the next thing to do (Connect, Cancel); once connected, the things you open (Terminal, VS Code, Files, Agents)
// sit in one row and the rest (node, VPN only, Disconnect) in the ⋮ menu. With Ask every time (ask_node) the node
// dialog opens by itself once connected.
import { Bot, ChevronDown, Code, Cpu, Folder, MoreVertical, Plug, Power, Server, Settings, Smartphone, SquareTerminal,
  Users, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useGo } from '../nav'
import { call } from '../rpc'
import { BUSY, DUO, fastLabel, type Cluster, type Session } from '../types/clusters'
import { agentIcon } from './agents/AgentIcon'
import { PairPhoneDialog } from './app/PairPhoneDialog'
import { ComputeDialog } from './clusters/ComputeDialog'
import { LogView } from './clusters/LogView'
import { shortName } from './clusters/loginCopy'
import { SettingsDialog } from './clusters/SettingsDialog'
import { Menu, type MenuItem } from './projects/Menu'
import { useToast } from './toast'
import { useTools } from './tools/useTools'
import { AlertDialog, Button, IconButton, IconTile, Spinner } from './ui'

type Open = null | 'settings' | 'compute' | 'size' | 'phone' | 'release' | { switch: { id: string; name: string }; vpnOnly: boolean }

const WAITING = 'Requesting compute node'

const AGENTS: [string, string, LucideIcon][] = [['agent:claude', 'Claude', agentIcon('claude')],
  ['agent:codex', 'ChatGPT', agentIcon('codex')],
  ['agent:agy', 'Antigravity', agentIcon('agy')], ['agent:cursor', 'Cursor', agentIcon('cursor')],
  ['ask', 'Ask all agents', Users]]

function Status({ s, vpnOnly }: { s: Session; vpnOnly: boolean }) {
  const [text, dot, look] = s.state === 'Connected'
    ? [vpnOnly ? 'VPN only' : 'Connected', 'bg-ok', 'text-ok']
    : s.state === 'Error' ? ["Didn't connect", 'bg-bad', 'text-bad']
      : s.state === 'Disconnected' ? ['Not connected', 'bg-dim/50', 'text-dim']
        : [s.state === DUO ? 'Approve Duo' : s.state, 'bg-warn animate-pulse', 'text-warn']
  return (
    <span className={`flex items-center gap-2 whitespace-nowrap text-sm font-semibold ${look}`}>
      <span className={`size-2 rounded-full ${dot}`} />{text}</span>
  )
}

function Action({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-lg bg-pill px-3.5 font-semibold hover:bg-selected
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <Icon size={16} className="text-dim" />{label}</button>
  )
}

export function ClusterCard({ cluster: c, session: s, log }: { cluster: Cluster; session: Session; log: string[] }) {
  const toast = useToast()
  const go = useGo()
  const tools = useTools()
  const [open, setOpen] = useState<Open>(null)
  const [hint, setHint] = useState('')
  const busy = BUSY.includes(s.state)
  const idle = s.state === 'Disconnected' || s.state === 'Error'
  const connected = s.connected ?? s.state === 'Connected'
  const vpnOnly = s.state === 'Connected' && !connected
  const [asked, setAsked] = useState(false)  // the dialog opened once for this pick
  useEffect(() => {
    if (s.pick_node && !asked) { setAsked(true); setOpen('compute') }
    if (!s.pick_node && asked) setAsked(false)
  }, [s.pick_node, asked])

  const run = (method: string, params: Record<string, unknown> = {}) =>
    call(method, { cluster: c.id, ...params }).catch((e: Error) => toast(e.message))

  async function connect(vpn = false, swap = false) {
    try {
      const r = await call<{ switch?: { id: string; name: string } } | null>('clusters.connect',
        { cluster: c.id, vpn_only: vpn, switch: swap })
      if (r?.switch) setOpen({ switch: r.switch, vpnOnly: vpn })
    } catch (e) {
      const msg = (e as Error).message
      if (msg.includes('settings')) { setHint(msg); setOpen('settings') } else toast(msg)
    }
  }

  const a = s.node ? s : null
  const fast = fastLabel(c)
  const more: MenuItem[][] = [
    connected ? (a
      ? [{ label: a.owned ? 'Release node…' : 'Stop using this node', icon: Power,
          onClick: () => (a.owned ? setOpen('release') : run('clusters.release_node')) }]
      : [{ label: 'Get a node…', icon: Cpu, onClick: () => setOpen('compute') },
          ...(fast ? [{ label: fast, icon: Zap, onClick: () => run('clusters.request_fast_node') }] : [])]) : [],
    idle ? [{ label: 'Node size…', icon: Cpu, onClick: () => setOpen('size') },
      ...(c.vpn.enabled ? [{ label: 'Connect VPN only', icon: Plug, onClick: () => connect(true) }] : [])] : [],
    [{ label: 'Connect phone', icon: Smartphone, onClick: () => setOpen('phone') }],
    s.state === 'Connected' ? [{ label: 'Disconnect', icon: Power, danger: true, onClick: () => run('clusters.disconnect') }]
      : [],
  ]
  const agents: MenuItem[][] = [AGENTS.map(([key, label, icon]) => ({ label, icon,
    onClick: () => tools.open(c.id, c.name, key) }))]

  return (
    <section className="flex flex-col rounded-xl bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 px-5 pt-4">
        <IconTile icon={Server} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold leading-tight">{c.name}</h2>
        </div>
        <Status s={s} vpnOnly={vpnOnly} />
        <IconButton icon={Settings} label={`${c.name} settings`} onClick={() => { setHint(''); setOpen('settings') }} />
        {more.some((g) => g.length) && <Menu groups={more} label="More" trigger={<MoreVertical size={20} />}
          className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-hover" />}
      </div>

      <div className="flex flex-col gap-3 px-5 pb-4 pt-3">
        {(busy || (s.detail && !vpnOnly)) && (
          <div className={`flex items-center gap-2 text-base ${s.state === 'Error' ? 'text-bad' : ''}`}>
            {busy && <Spinner />}
            <span className={`min-w-0 break-words ${s.state === DUO ? 'font-semibold' : ''}`}>
              {s.detail}</span>
          </div>
        )}
        {s.state === WAITING && <p className="-mt-1 text-sm text-dim">
          Waiting for a free node. Usually under a minute, longer when the cluster is busy.</p>}

        {connected && (
          <>
            <div className="flex items-center gap-2.5 text-base">
              <Cpu size={16} className="shrink-0 text-dim" />
              {a
                ? <span className="select-text">On node <b>{a.node}</b> <span className="text-dim">· job {a.job}
                    {a.owned ? '' : ', started elsewhere'}</span></span>
                : <><span className="text-dim">No compute node</span>
                    <button type="button" onClick={() => setOpen('compute')} disabled={busy}
                      className="font-semibold text-accent-text hover:underline disabled:opacity-50">Get one</button></>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Action icon={SquareTerminal} label="Terminal" onClick={() => go('terminals', { cluster: c.id, new: '1' })} />
              <Action icon={Code} label="VS Code" onClick={() => tools.open(c.id, c.name, 'vscode')} />
              <Action icon={Folder} label="Files" onClick={() => tools.open(c.id, c.name, 'files')} />
              <Menu groups={agents} label="Agents" trigger={<><Bot size={16} className="text-dim" />Agents
                <ChevronDown size={16} className="text-dim" /></>}
                className="flex h-10 items-center gap-2 rounded-lg bg-pill px-3.5 font-semibold hover:bg-selected" />
            </div>
          </>
        )}

        {(idle || busy || vpnOnly) && (
          <div className="flex items-center gap-3">
            <span className="flex-1" />
            {busy
              ? <Button onClick={() => run('clusters.cancel')} disabled={s.state === 'Disconnecting'}>
                  {s.state === 'Disconnecting' ? 'Disconnecting…' : s.state === WAITING ? 'Stop waiting' : 'Stop signing in'}</Button>
              : vpnOnly
                ? <Button onClick={() => run('clusters.disconnect')}>Disconnect</Button>
                : <Button kind="primary" className="min-w-[120px]" onClick={() => connect()}>
                    {s.state === 'Error' ? 'Try again' : 'Connect'}</Button>}
          </div>
        )}
      </div>

      <div className="border-t border-line px-5 py-1"><LogView lines={log} /></div>

      {tools.dialog}
      {open === 'settings' && <SettingsDialog cluster={c} hint={hint} onClose={() => setOpen(null)} />}
      {open === 'compute' && <ComputeDialog cluster={c} onClose={() => setOpen(null)} />}
      {open === 'size' && <ComputeDialog cluster={c} saveOnly onClose={() => setOpen(null)} />}
      {open === 'phone' && <PairPhoneDialog only={[c.id]} onClose={() => setOpen(null)} />}
      {open === 'release' && a && <AlertDialog title={`Release node ${a.node}?`} keep="Keep it" act="Release node"
        onAct={() => { setOpen(null); run('clusters.release_node') }} onClose={() => setOpen(null)}>
        <p>Anything running on it stops.</p>
        <p>You stay connected, and your files stay where they are.</p>
      </AlertDialog>}
      {open && typeof open === 'object' && (
        <AlertDialog title={`Disconnect ${shortName(open.switch)}?`} keep={`Stay on ${shortName(open.switch)}`}
          act={`Switch to ${shortName(c)}`} onClose={() => setOpen(null)}
          onAct={() => { setOpen(null); connect(open.vpnOnly, true) }}>
          <p>Only one VPN can run at a time. {shortName(open.switch)} disconnects and its node is released.</p>
        </AlertDialog>
      )}
    </section>
  )
}
