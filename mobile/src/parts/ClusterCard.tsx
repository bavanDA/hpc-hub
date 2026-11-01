// One cluster on the phone. The status sits under the name; the big button is the next thing to do (Connect,
// Cancel, Stop waiting, or Open a terminal once connected). Before you connect, one quiet row says what node you'll
// get; tapping it opens the node screen. Once connected, the node is a line of information and the other things you
// open are four big tiles (2 x 2, at least 56 px tall); the rest (node, sign-in, settings, Disconnect) are in ⋮.
import { Bot, ChevronRight, Code, Cpu, FileCode2, Folder, MoreVertical, Power, ScanQrCode, Settings, SquareTerminal,
  Users, Zap,
  type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { leftText, useTimeLeft } from '@shared/components/app/watch'
import { LogView } from '@shared/components/clusters/LogView'
import { Spinner } from '@shared/components/ui'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import { BUSY, DUO, fastLabel, type Cluster, type Session } from '@shared/types/clusters'
import { ActionSheet, Button, Card, ConfirmSheet, useToast, type SheetAction } from '../ui'
import { ClusterSettingsSheet } from './ClusterSettingsSheet'
import { LoginSheet } from './LoginSheet'
import { nodeLine, NodeSheet } from './NodeSheet'
import { scanPairing } from './scanPairing'

const WAITING = 'Requesting compute node'

type Open = '' | 'login' | 'settings' | 'setup' | 'request' | 'more' | 'agents' | 'release'

const AGENTS: [string, string][] = [['claude', 'Claude'], ['codex', 'ChatGPT'], ['agy', 'Antigravity'], ['cursor', 'Cursor']]

function Status({ s, vpnOnly }: { s: Session; vpnOnly: boolean }) {
  const [text, dot, look] = s.state === 'Connected'
    ? [vpnOnly ? 'VPN only' : 'Connected', 'bg-ok', 'text-ok']
    : s.state === 'Error' ? ["Didn't connect", 'bg-bad', 'text-bad']
      : s.state === 'Disconnected' ? ['Not connected', 'bg-dim/50', 'text-dim']
        : [s.state === DUO ? 'Approve Duo' : s.state === WAITING ? 'Getting a node' : s.state, 'bg-warn animate-pulse',
            'text-warn']
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-semibold ${look}`}>
      <span className={`size-2 rounded-full ${dot}`} />{text}</span>
  )
}

/** One of the things you open: a big tile with its icon beside its name, two per row. */
function Open({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex min-h-14 min-w-0 items-center gap-3 rounded-xl bg-pill px-4
      text-left font-semibold active:bg-selected">
      <Icon size={22} className="shrink-0 text-accent-text" /><span className="min-w-0 truncate">{label}</span></button>
  )
}

export function ClusterCard({ cluster: c, session: s, log }: { cluster: Cluster; session: Session; log: string[] }) {
  const toast = useToast()
  const go = useGo()
  const [open, setOpen] = useState<Open>('')
  const [hint, setHint] = useState('')
  const busy = BUSY.includes(s.state)
  const idle = s.state === 'Disconnected' || s.state === 'Error'
  const connected = s.connected ?? s.state === 'Connected'
  const vpnOnly = s.state === 'Connected' && !connected
  const left = useTimeLeft(c.id, s.job ?? '')
  const run = (method: string) => call(method, { cluster: c.id }).catch((e: Error) => toast(e.message))
  const close = () => setOpen('')

  const [asked, setAsked] = useState(false)  // Ask before each request: the node screen opened once for this pick
  useEffect(() => {
    if (s.pick_node && !asked) { setAsked(true); setOpen('request') }
    if (!s.pick_node && asked) setAsked(false)
  }, [s.pick_node, asked])

  async function connect() {
    try {
      await call('clusters.connect', { cluster: c.id, switch: true })
    } catch (e) {
      const msg = (e as Error).message
      // no username yet: the sign-in sheet is where it goes
      if (/username|settings/i.test(msg)) { setHint(msg); setOpen('login') } else toast(msg)
    }
  }

  async function scan() {
    const { msg, names } = await scanPairing()
    if (names.includes(c.name)) await connect()
    else if (msg) toast(msg)
  }

  const fast = fastLabel(c)
  const more: SheetAction[] = [
    ...(connected && s.node ? [{ label: s.owned ? 'Release node' : 'Stop using this node', icon: Power,
      onPick: () => (s.owned ? setOpen('release') : run('clusters.release_node')) }] : []),
    ...(connected && !s.node ? [{ label: 'Get a node', icon: Cpu, onPick: () => setOpen('request') },
      ...(fast ? [{ label: fast, icon: Zap, onPick: () => run('clusters.request_fast_node') }] : [])] : []),
    { label: 'Sign-in', icon: ScanQrCode, onPick: () => { setHint(''); setOpen('login') } },
    { label: `${c.name} settings`, icon: Settings, onPick: () => setOpen('settings') },
    ...(s.state === 'Connected' ? [{ label: 'Disconnect', icon: Power, danger: true,
      onPick: () => run('clusters.disconnect') }] : []),
  ]
  const agents: SheetAction[] = [
    ...AGENTS.map(([id, label]) => ({ label, icon: Bot, onPick: () => go('agents', { cluster: c.id, start: id }) })),
    { label: 'Ask all agents', icon: Users, onPick: () => go('agents', { cluster: c.id, start: 'ask' }) },
  ]

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight">{c.name}</h2>
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 text-sm">
            <Status s={s} vpnOnly={vpnOnly} />
            <span className="truncate text-dim">{c.host || 'No host set'}</span>
          </div>
        </div>
        <button aria-label={`More for ${c.name}`} onClick={() => setOpen('more')}
          className="-mr-2 -mt-1 grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-hover">
          <MoreVertical size={22} /></button>
      </div>

      {(busy || (s.detail && !vpnOnly)) && (
        <div className={`flex items-center gap-2 ${s.state === 'Error' ? 'text-bad' : ''}`}>
          {busy && <Spinner />}
          <span className={`min-w-0 break-words text-sm ${s.state === DUO ? 'font-bold text-accent-text' : ''}`}>
            {s.detail}</span>
        </div>
      )}
      {s.state === WAITING && <p className="-mt-1 text-sm text-dim">
        Waiting for a free node. Usually under a minute, longer when the cluster is busy.</p>}

      {connected && (
        <>
          <div className="flex min-h-14 items-center gap-3 rounded-xl bg-inset px-4 py-2">
            <Cpu size={20} className="shrink-0 text-dim" />
            {s.node
              ? <span className="min-w-0 flex-1 select-text"><span className="block font-semibold">Node {s.node}
                  {left !== null && <span className="font-normal text-dim"> · {leftText(left)}</span>}</span>
                  <span className="block text-sm text-dim">Job {s.job}</span></span>
              : <><span className="flex-1 text-dim">No compute node yet</span>
                  <button onClick={() => setOpen('request')} disabled={busy}
                    className="-mr-2 h-12 rounded-full px-4 font-semibold text-accent-text active:bg-hover
                      disabled:opacity-50">Get one</button></>}
          </div>
          <Button kind="primary" icon={SquareTerminal} className="w-full"
            onClick={() => go('terminals', { cluster: c.id, new: '1' })}>Open a terminal</Button>
          <div className="grid grid-cols-2 gap-2">
            <Open icon={FileCode2} label="Code" onClick={() => go('code', { cluster: c.id })} />
            <Open icon={Folder} label="Files" onClick={() => go('files', { cluster: c.id })} />
            <Open icon={Bot} label="Agents" onClick={() => setOpen('agents')} />
            <Open icon={Code} label="VS Code" onClick={() => go('agents', { cluster: c.id, start: 'vscode' })} />
          </div>
        </>
      )}

      {idle && (
        <button onClick={() => setOpen('setup')} className="flex min-h-14 items-center gap-3 rounded-xl bg-inset px-4
          text-left text-sm active:bg-hover">
          <Cpu size={20} className="shrink-0 text-dim" />
          <span className="min-w-0 flex-1">{nodeLine(c)}{c.ask_node && c.request_node_on_connect !== false
            ? ', asks first' : ''}</span>
          <ChevronRight size={20} className="shrink-0 text-dim" />
        </button>
      )}

      {(idle || busy || vpnOnly) && (
        <div className="flex gap-2">
          {idle && <Button icon={ScanQrCode} aria-label="Sign in with a QR code" className="shrink-0" onClick={scan}>
            QR</Button>}
          {busy
            ? <Button className="flex-1" disabled={s.state === 'Disconnecting'} onClick={() => run('clusters.cancel')}>
                {s.state === 'Disconnecting' ? 'Disconnecting' : s.state === WAITING ? 'Stop waiting' : 'Cancel'}</Button>
            : vpnOnly
              ? <Button className="flex-1" onClick={() => run('clusters.disconnect')}>Disconnect</Button>
              : <Button kind="primary" className="flex-1" onClick={connect}>
                  {s.state === 'Error' ? 'Try again' : 'Connect'}</Button>}
        </div>
      )}

      <LogView lines={log} />

      {open === 'release' && <ConfirmSheet title={`Release node ${s.node}?`} danger confirm="Release node"
        text={`Job ${s.job} ends and the node goes back to the cluster. Anything running there stops. `
          + 'You stay connected, and your files stay where they are.'}
        onConfirm={() => { close(); run('clusters.release_node') }} onClose={close} />}
      {open === 'more' && <ActionSheet title={c.name} actions={more} onClose={close} />}
      {open === 'agents' && <ActionSheet title={`Start an agent on ${c.name}`} actions={agents} onClose={close} />}
      {open === 'login' && <LoginSheet cluster={c} hint={hint} onClose={close} />}
      {open === 'settings' && <ClusterSettingsSheet cluster={c} onClose={close} />}
      {(open === 'setup' || open === 'request') && <NodeSheet cluster={c} mode={open} onClose={close} />}
    </Card>
  )
}
