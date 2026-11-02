// One cluster on the phone, in style E: its name and a status dot and word, then rows. Before you connect, one
// button (Connect). Once connected, rows: the node (or Get a node), Terminal, Code, Files, Agents, VS Code, each
// opening its screen. The rest (the node's size, sign-in, settings, Release node, Disconnect) are in ⋮.
// The node shows here only: Clusters has no status strip.
import { Bot, Code, Cpu, FileCode2, Folder, MoreVertical, Power, ScanQrCode, ScrollText, Settings, SquareTerminal,
  Users, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'

import { leftText, useTimeLeft } from '@shared/components/app/watch'
import { agentIcon } from '@shared/components/agents/AgentIcon'
import { Spinner } from '@shared/components/ui'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import { BUSY, DUO, fastLabel, type Cluster, type Session } from '@shared/types/clusters'
import { ActionSheet, Button, ConfirmSheet, List, Row, Sheet, StatusDot, useToast, type SheetAction, type Tone } from '../ui'
import { ClusterSettingsSheet } from './ClusterSettingsSheet'
import { LoginSheet } from './LoginSheet'
import { NodeSheet, shortName } from './NodeSheet'

const WAITING = 'Requesting compute node'

type Open = '' | 'login' | 'settings' | 'setup' | 'request' | 'more' | 'agents' | 'release' | 'log'

const AGENTS: [string, string][] = [['claude', 'Claude'], ['codex', 'ChatGPT'], ['agy', 'Antigravity'], ['cursor', 'Cursor']]

function status(s: Session, vpnOnly: boolean): [string, Tone] {
  if (s.state === 'Connected') return [vpnOnly ? 'VPN only' : 'Connected', 'on']
  if (s.state === 'Error') return ["Didn't connect", 'error']
  if (s.state === 'Disconnected') return ['Not connected', 'off']
  return [s.state === DUO ? 'Approve Duo' : s.state === WAITING ? 'Getting a node' : s.state, 'busy']
}

/** The log, full screen: what happened, newest at the bottom. */
function LogSheet({ name, lines, onClose }: { name: string; lines: string[]; onClose: () => void }) {
  return (
    <Sheet title={`Log, ${name}`} onClose={onClose}>
      <pre className="font-mono text-xs leading-[1.5] break-all whitespace-pre-wrap select-text">
        {lines.length ? lines.join('\n') : <span className="text-dim">Nothing yet</span>}</pre>
    </Sheet>
  )
}

/** primary: this card's Connect is the screen's main button (one per screen); the others are plain. */
export function ClusterCard({ cluster: c, session: s, log, primary = false }:
  { cluster: Cluster; session: Session; log: string[]; primary?: boolean }) {
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
  const short = shortName(c)
  const [word, tone] = status(s, vpnOnly)

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

  const fast = fastLabel(c)
  const more: SheetAction[] = [
    ...(connected && s.node ? [{ label: s.owned ? 'Release node' : 'Stop using this node', icon: Power,
      onPick: () => (s.owned ? setOpen('release') : run('clusters.release_node')) }] : []),
    ...(connected && !s.node && fast ? [{ label: fast, icon: Zap, onPick: () => run('clusters.request_fast_node') }] : []),
    { label: 'Compute node', icon: Cpu, onPick: () => setOpen('setup') },
    { label: 'Sign in', icon: ScanQrCode, onPick: () => { setHint(''); setOpen('login') } },
    { label: 'Settings', icon: Settings, onPick: () => setOpen('settings') },
    { label: 'Log', icon: ScrollText, onPick: () => setOpen('log') },
    ...(s.state === 'Connected' ? [{ label: 'Disconnect', icon: Power, danger: true,
      onPick: () => run('clusters.disconnect') }] : []),
  ]
  const agents: SheetAction[] = [
    ...AGENTS.map(([id, label]) => ({ label, icon: agentIcon(id), onPick: () => go('agents', { cluster: c.id, start: id }) })),
    { label: 'Ask all agents', icon: Users, onPick: () => go('agents', { cluster: c.id, start: 'ask' }) },
  ]
  const stop = s.state === 'Disconnecting' ? 'Disconnecting' : s.state === WAITING ? 'Stop waiting' : 'Stop signing in'

  return (
    <section aria-label={c.name}>
      <div className="flex items-start gap-2 pr-1 pl-4">
        <div className="min-w-0 flex-1 py-1">
          <h2 className="text-[17px] leading-snug font-semibold">{c.name}</h2>
          <p className={`flex items-center gap-2 text-sm ${tone === 'error' ? 'text-bad' : 'text-dim'}`}>
            <StatusDot tone={tone} />{word}</p>
        </div>
        <button aria-label={`More for ${short}`} onClick={() => setOpen('more')}
          className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed">
          <MoreVertical size={22} /></button>
      </div>

      {(busy || (s.detail && !vpnOnly && !connected)) && (
        <div className={`flex items-start gap-2 px-4 pt-2 text-sm break-words ${s.state === 'Error' ? 'text-bad'
          : s.state === DUO ? 'font-semibold' : 'text-dim'}`}>
          {busy && <span className="pt-0.5"><Spinner size={14} /></span>}
          <span className="min-w-0">{s.state === WAITING
            ? 'Waiting for a free node. Usually under a minute.' : s.detail}</span>
        </div>
      )}

      {connected && (
        <List className="mt-3">
          {s.node
            ? <Row icon={Cpu} label="Node" value={<span className="select-text">{s.node}
                {left !== null && <small className="block text-sm font-normal text-dim">{leftText(left)}</small>}</span>} />
            : <Row icon={Cpu} label="Get a node" opens onPress={() => setOpen('request')} />}
          <Row icon={SquareTerminal} label="Terminal" opens onPress={() => go('terminals', { cluster: c.id, new: '1' })} />
          <Row icon={FileCode2} label="Code" opens onPress={() => go('code', { cluster: c.id })} />
          <Row icon={Folder} label="Files" opens onPress={() => go('files', { cluster: c.id })} />
          <Row icon={Bot} label="Agents" opens onPress={() => setOpen('agents')} />
          <Row icon={Code} label="VS Code" opens onPress={() => go('agents', { cluster: c.id, start: 'vscode' })} />
        </List>
      )}

      {(idle || busy || vpnOnly) && (
        <div className="px-4 pt-3">
          {busy
            ? <Button className="w-full" disabled={s.state === 'Disconnecting'} onClick={() => run('clusters.cancel')}>
                {stop}</Button>
            : vpnOnly
              ? <Button className="w-full" onClick={() => run('clusters.disconnect')}>Disconnect</Button>
              : <Button kind={primary ? 'primary' : 'plain'} className="w-full" onClick={connect}>
                  {s.state === 'Error' ? 'Try again' : 'Connect'}</Button>}
        </div>
      )}

      {open === 'release' && <ConfirmSheet title={`Release node ${s.node}?`} danger keep="Keep it" confirm="Release node"
        text="Anything running on it stops. You stay connected, and your files stay where they are."
        onConfirm={() => run('clusters.release_node')} onClose={close} />}
      {open === 'more' && <ActionSheet title={short} actions={more} onClose={close} />}
      {open === 'agents' && <ActionSheet title={`Start an agent on ${short}`} actions={agents} onClose={close} />}
      {open === 'login' && <LoginSheet cluster={c} hint={hint} onClose={close} />}
      {open === 'settings' && <ClusterSettingsSheet cluster={c} onClose={close} />}
      {open === 'log' && <LogSheet name={short} lines={log} onClose={close} />}
      {(open === 'setup' || open === 'request') && <NodeSheet cluster={c} mode={open} onClose={close} />}
    </section>
  )
}
