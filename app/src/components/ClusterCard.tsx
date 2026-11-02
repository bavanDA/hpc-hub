// One cluster in style E, the phone's ClusterCard (mobile/src/parts/ClusterCard.tsx) at desktop size: its name with
// a status dot and word, the next thing to do (Connect, Stop signing in) on the right, then rows once connected:
// the node (or Get a node), Terminal, Code, Files, Agents, VS Code. The rest (the node's size, sign-in, settings,
// the log, Release node, Disconnect) are in ⋮. With Ask every time (ask_node) the node window opens by itself.
import { Bot, ChevronRight, Code, Cpu, FileCode2, Folder, MoreVertical, Plug, Power, ScanQrCode, ScrollText, Settings,
  Smartphone, SquareTerminal, Users, Zap, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useGo } from '../nav'
import { call } from '../rpc'
import { BUSY, DUO, fastLabel, type Cluster, type Session } from '../types/clusters'
import { agentIcon } from './agents/AgentIcon'
import { PairPhoneDialog } from './app/PairPhoneDialog'
import { leftText, useTimeLeft } from './app/watch'
import { ComputeDialog } from './clusters/ComputeDialog'
import { LogDialog } from './clusters/LogDialog'
import { shortName } from './clusters/loginCopy'
import { SettingsDialog } from './clusters/SettingsDialog'
import { Button, ConfirmDialog, StatusDot, type Tone } from './e/parts'
import { List, Row } from './e/ui'
import { Menu, type MenuItem } from './projects/Menu'
import { useToast } from './toast'
import { useTools } from './tools/useTools'
import { Spinner } from './ui'

type Open = null | 'settings' | 'login' | 'request' | 'setup' | 'phone' | 'log' | 'release' | 'disconnect'
  | { switch: { id: string; name: string }; vpnOnly: boolean }

const WAITING = 'Requesting compute node'

const AGENTS: [string, string, LucideIcon][] = [['agent:claude', 'Claude', agentIcon('claude')],
  ['agent:codex', 'ChatGPT', agentIcon('codex')],
  ['agent:agy', 'Antigravity', agentIcon('agy')], ['agent:cursor', 'Cursor', agentIcon('cursor')],
  ['ask', 'Ask all agents', Users]]

function status(s: Session, vpnOnly: boolean): [string, Tone] {
  if (s.state === 'Connected') return [vpnOnly ? 'VPN only' : 'Connected', 'on']
  if (s.state === 'Error') return ["Didn't connect", 'error']
  if (s.state === 'Disconnected') return ['Not connected', 'off']
  return [s.state === DUO ? 'Approve Duo' : s.state === WAITING ? 'Getting a node' : s.state, 'busy']
}

/** primary: this card's Connect is the page's main button (one per page); the others are plain. */
export function ClusterCard({ cluster: c, session: s, log, primary = false }:
  { cluster: Cluster; session: Session; log: string[]; primary?: boolean }) {
  const toast = useToast()
  const go = useGo()
  const tools = useTools()
  const [open, setOpen] = useState<Open>(null)
  const [hint, setHint] = useState('')
  const busy = BUSY.includes(s.state)
  const idle = s.state === 'Disconnected' || s.state === 'Error'
  const connected = s.connected ?? s.state === 'Connected'
  const vpnOnly = s.state === 'Connected' && !connected
  const left = useTimeLeft(c.id, s.job ?? '')
  const short = shortName(c)
  const [word, tone] = status(s, vpnOnly)
  const close = () => setOpen(null)
  const [asked, setAsked] = useState(false)  // the window opened once for this pick
  useEffect(() => {
    if (s.pick_node && !asked) { setAsked(true); setOpen('request') }
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
      if (msg.includes('settings')) { setHint(msg); setOpen('login') } else toast(msg)
    }
  }

  const a = s.node ? s : null
  const fast = fastLabel(c)
  const more: MenuItem[][] = [
    [...(connected && a ? [{ label: a.owned ? 'Release node' : 'Stop using this node', icon: Power,
      onClick: () => (a.owned ? setOpen('release') : run('clusters.release_node')) }] : []),
    ...(connected && !a && fast ? [{ label: fast, icon: Zap, onClick: () => run('clusters.request_fast_node') }] : []),
    { label: 'Compute node', icon: Cpu, onClick: () => setOpen('setup') }],
    [{ label: 'Sign in', icon: ScanQrCode, onClick: () => { setHint(''); setOpen('login') } },
      { label: 'Settings', icon: Settings, onClick: () => { setHint(''); setOpen('settings') } },
      { label: 'Log', icon: ScrollText, onClick: () => setOpen('log') },
      { label: 'Connect phone', icon: Smartphone, onClick: () => setOpen('phone') }],
    [...(idle && c.vpn.enabled ? [{ label: 'Connect VPN only', icon: Plug, onClick: () => connect(true) }] : []),
      ...(s.state === 'Connected' ? [{ label: 'Disconnect', icon: Power, danger: true,
        onClick: () => (a?.owned ? setOpen('disconnect') : run('clusters.disconnect')) }] : [])],
  ]
  const agents: MenuItem[][] = [AGENTS.map(([key, label, icon]) => ({ label, icon,
    onClick: () => tools.open(c.id, c.name, key) }))]
  const stop = s.state === 'Disconnecting' ? 'Disconnecting' : s.state === WAITING ? 'Stop waiting' : 'Stop signing in'

  return (
    <section aria-label={c.name}>
      <div className="flex items-center gap-3 pr-3 pl-5">
        <div className="min-w-0 flex-1 py-1">
          <h2 className="text-lg leading-snug font-semibold">{c.name}</h2>
          <p className={`flex items-center gap-2 text-sm ${tone === 'error' ? 'text-bad' : 'text-dim'}`}>
            <StatusDot tone={tone} />{word}</p>
        </div>
        {busy
          ? <Button disabled={s.state === 'Disconnecting'} onClick={() => run('clusters.cancel')}>{stop}</Button>
          : vpnOnly
            ? <Button onClick={() => run('clusters.disconnect')}>Disconnect</Button>
            : idle && <Button kind={primary ? 'primary' : 'plain'} className="min-w-[120px]" onClick={() => connect()}>
                {s.state === 'Error' ? 'Try again' : 'Connect'}</Button>}
        <Menu groups={more} label={`More for ${short}`} trigger={<MoreVertical size={20} />}
          className="grid size-10 shrink-0 place-items-center rounded-full text-dim hover:bg-hover" />
      </div>

      {(busy || (s.detail && !vpnOnly)) && (
        <div className={`flex items-start gap-2 px-5 pt-2 break-words ${s.state === 'Error' ? 'text-bad'
          : s.state === DUO ? 'font-semibold' : 'text-dim'}`}>
          {busy && <span className="pt-0.5"><Spinner size={14} /></span>}
          <span className="min-w-0">{s.detail}{s.state === WAITING && <span className="block text-sm">
            Waiting for a free node. Usually under a minute, longer when the cluster is busy.</span>}</span>
        </div>
      )}

      {connected && (
        <div className="mt-3"><List>
          {a
            ? <Row icon={Cpu} label="Node" sub={`Job ${a.job}${a.owned ? '' : ', started elsewhere'}`}
                value={<span className="select-text">{a.node}
                  {left !== null && <small className="block text-sm font-normal text-dim">{leftText(left)}</small>}</span>} />
            : <Row icon={Cpu} label="Get a node" opens onPress={() => !busy && setOpen('request')} />}
          <Row icon={SquareTerminal} label="Terminal" opens onPress={() => go('terminals', { cluster: c.id, new: '1' })} />
          <Row icon={FileCode2} label="Code" opens onPress={() => go('code', { cluster: c.id })} />
          <Row icon={Folder} label="Files" opens onPress={() => tools.open(c.id, c.name, 'files')} />
          <Menu groups={agents} label={`Agents on ${short}`} trigger={<>
            <Bot size={18} className="shrink-0 text-dim" /><span className="flex-1">Agents</span>
            <ChevronRight size={16} className="-mr-1 shrink-0 text-dim" /></>}
            className="flex min-h-12 w-full items-center gap-3 border-b border-line px-5 py-2 text-left hover:bg-hover
              active:bg-pressed" />
          <Row icon={Code} label="VS Code" opens onPress={() => tools.open(c.id, c.name, 'vscode')} />
        </List></div>
      )}

      {tools.dialog}
      {(open === 'settings' || open === 'login') && <SettingsDialog cluster={c} hint={hint}
        start={open === 'login' ? 'login' : ''} onClose={close} />}
      {(open === 'request' || open === 'setup') && <ComputeDialog cluster={c} mode={open} onClose={close} />}
      {open === 'phone' && <PairPhoneDialog only={[c.id]} onClose={close} />}
      {open === 'log' && <LogDialog name={short} lines={log} onClose={close} />}
      {open === 'release' && a && <ConfirmDialog title={`Release node ${a.node}?`} danger keep="Keep it"
        confirm="Release node" onConfirm={() => run('clusters.release_node')} onClose={close}
        text={<><p>Anything running on it stops.</p><p>You stay connected, and your files stay where they are.</p></>} />}
      {open === 'disconnect' && a && <ConfirmDialog title={`Disconnect ${short}?`} danger keep="Stay connected"
        confirm="Disconnect" text={`Node ${a.node} is released.`} onConfirm={() => run('clusters.disconnect')}
        onClose={close} />}
      {open && typeof open === 'object' && (
        <ConfirmDialog title={`Disconnect ${shortName(open.switch)}?`} danger keep={`Stay on ${shortName(open.switch)}`}
          confirm={`Switch to ${short}`} onClose={close} onConfirm={() => connect(open.vpnOnly, true)}
          text={`Only one VPN can run at a time. ${shortName(open.switch)} disconnects and its node is released.`} />
      )}
    </section>
  )
}
