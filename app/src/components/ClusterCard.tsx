// One card per cluster, like the GTK app's (cluster_card.py). The status says where you are; the main button is
// the next thing to do (Connect, Stop signing in); once connected, the node line and the things you open (Terminal,
// VS Code, Files, Agents) sit in one row. The gear opens the settings; ⋮ has the rest (the node's size, Release
// node, Disconnect). With Ask every time (ask_node) the node window opens by itself once connected.
import { Bot, ChevronDown, Code, Cpu, Folder, MoreVertical, Plug, Power, Server, Settings, Smartphone,
  SquareTerminal, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useGo } from '../nav'
import { call } from '../rpc'
import { BUSY, DUO, type Cluster, type Session } from '../types/clusters'
import { agentIcon } from './agents/AgentIcon'
import { PairPhoneDialog } from './app/PairPhoneDialog'
import { leftText, useTimeLeft } from './app/watch'
import { ComputeDialog } from './clusters/ComputeDialog'
import { LogView } from './clusters/LogView'
import { shortName } from './clusters/loginCopy'
import { SettingsDialog } from './clusters/SettingsDialog'
import { EButton } from './e/extra'
import { ConfirmDialog, StatusDot, type Tone } from './e/parts'
import { Menu, type MenuItem } from './projects/Menu'
import { useToast } from './toast'
import { useTools } from './tools/useTools'
import { IconButton, IconTile, Spinner } from './ui'

type Open = null | 'settings' | 'login' | 'compute' | 'request' | 'phone' | 'release' | 'disconnect'
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

function Action({ icon: Icon, label, onClick }: { icon: LucideIcon; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex h-10 items-center gap-2 rounded-lg bg-pill px-3.5 font-semibold hover:bg-selected
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
      <Icon size={16} className="text-dim" />{label}</button>
  )
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
  const more: MenuItem[][] = [
    [...(connected && a ? [{ label: a.owned ? 'Release node' : 'Stop using this node', icon: Power,
      onClick: () => (a.owned ? setOpen('release') : run('clusters.release_node')) }] : []),
    { label: 'Compute node', icon: Cpu, onClick: () => { setHint(''); setOpen('compute') } }],
    [{ label: 'Connect phone', icon: Smartphone, onClick: () => setOpen('phone') }],
    [...(idle && c.vpn.enabled ? [{ label: 'Connect VPN only', icon: Plug, onClick: () => connect(true) }] : []),
      ...(s.state === 'Connected' ? [{ label: 'Disconnect', icon: Power, danger: true,
        onClick: () => (a?.owned ? setOpen('disconnect') : run('clusters.disconnect')) }] : [])],
  ]
  const agents: MenuItem[][] = [AGENTS.map(([key, label, icon]) => ({ label, icon,
    onClick: () => tools.open(c.id, c.name, key) }))]
  const stop = s.state === 'Disconnecting' ? 'Disconnecting' : s.state === WAITING ? 'Stop waiting' : 'Stop signing in'

  return (
    <section aria-label={c.name} className="flex flex-col rounded-xl bg-card shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-3 px-5 pt-4">
        <IconTile icon={Server} />
        <h2 className="min-w-0 flex-1 text-lg leading-tight font-semibold">{c.name}</h2>
        <span className={`flex items-center gap-2 text-sm font-semibold whitespace-nowrap
          ${tone === 'error' ? 'text-bad' : tone === 'off' ? 'text-dim' : 'text-text'}`}>
          <StatusDot tone={tone} />{word}</span>
        <IconButton icon={Settings} label={`${short} settings`} onClick={() => { setHint(''); setOpen('settings') }} />
        <Menu groups={more} label={`More for ${short}`} trigger={<MoreVertical size={20} />}
          className="grid size-9 shrink-0 place-items-center rounded-full text-dim hover:bg-hover" />
      </div>

      <div className="flex flex-col gap-3 px-5 pt-3 pb-4">
        {(busy || (s.detail && !vpnOnly)) && (
          <div className={`flex items-center gap-2 text-base ${s.state === 'Error' ? 'text-bad' : ''}`}>
            {busy && <Spinner />}
            <span className={`min-w-0 break-words ${s.state === DUO ? 'font-semibold' : ''}`}>{s.detail}</span>
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
                    {a.owned ? '' : ', started elsewhere'}{left !== null && ` · ${leftText(left)}`}</span></span>
                : <><span className="text-dim">No compute node</span>
                    <button type="button" onClick={() => setOpen('request')} disabled={busy}
                      className="font-semibold underline-offset-2 hover:underline disabled:opacity-50">Get one</button></>}
            </div>
            <div className="flex flex-wrap gap-2">
              <Action icon={SquareTerminal} label="Terminal" onClick={() => go('terminals', { cluster: c.id, new: '1' })} />
              <Action icon={Code} label="VS Code" onClick={() => tools.open(c.id, c.name, 'vscode')} />
              <Action icon={Folder} label="Files" onClick={() => tools.open(c.id, c.name, 'files')} />
              <Menu groups={agents} label={`Agents on ${short}`} trigger={<><Bot size={16} className="text-dim" />Agents
                <ChevronDown size={16} className="text-dim" /></>}
                className="flex h-10 items-center gap-2 rounded-lg bg-pill px-3.5 font-semibold hover:bg-selected" />
            </div>
          </>
        )}

        {(idle || busy || vpnOnly) && (
          <div className="flex items-center justify-end">
            {busy
              ? <EButton disabled={s.state === 'Disconnecting'} onClick={() => run('clusters.cancel')}>{stop}</EButton>
              : vpnOnly
                ? <EButton onClick={() => run('clusters.disconnect')}>Disconnect</EButton>
                : <EButton kind={primary ? 'primary' : 'plain'} className="min-w-[120px]" onClick={() => connect()}>
                    {s.state === 'Error' ? 'Try again' : 'Connect'}</EButton>}
          </div>
        )}
      </div>

      <div className="border-t border-line px-5 py-1"><LogView lines={log} /></div>

      {tools.dialog}
      {(open === 'settings' || open === 'login' || open === 'compute') && <SettingsDialog cluster={c} hint={hint}
        start={open === 'settings' ? '' : open} onClose={close} />}
      {open === 'request' && <ComputeDialog cluster={c} onClose={close} />}
      {open === 'phone' && <PairPhoneDialog only={[c.id]} onClose={close} />}
      {open === 'release' && a && <ConfirmDialog title={`Release node ${a.node}?`} danger keep="Keep it"
        confirm="Release node" onConfirm={() => run('clusters.release_node')} onClose={close}
        text={<><p>Anything running on it stops.</p><p>You stay connected, and your files stay where they are.</p></>} />}
      {open === 'disconnect' && a && <ConfirmDialog title={`Disconnect ${short}?`} danger keep="Stay connected"
        confirm="Disconnect" text={`This releases node ${a.node}.`} onConfirm={() => run('clusters.disconnect')}
        onClose={close} />}
      {open && typeof open === 'object' && (
        <ConfirmDialog title={`Disconnect ${shortName(open.switch)}?`} danger keep={`Stay on ${shortName(open.switch)}`}
          confirm={`Switch to ${short}`} onClose={close} onConfirm={() => connect(open.vpnOnly, true)}
          text={`Only one VPN can run at a time. ${shortName(open.switch)} disconnects and its node is released.`} />
      )}
    </section>
  )
}
