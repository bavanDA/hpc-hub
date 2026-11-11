// One cluster on the phone: the desktop's card (components/ClusterCard.tsx), the status under the name so gear and
// ⋮ fit on one line. Once connected: the node and the actions. Sign in in ⋮ opens the Sign-in window.
import { Bot, ChevronDown, Code, Cpu, Folder, MoreVertical, Plug, Power, ScanQrCode, Server, Settings, Smartphone,
  SquareTerminal, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import { agentIcon } from '@shared/components/agents/AgentIcon'
import { PairPhoneDialog } from '@shared/components/app/PairPhoneDialog'
import { leftText, useTimeLeft } from '@shared/components/app/watch'
import { ClusterAction } from '@shared/components/ClusterAction'
import { shortName } from '@shared/components/clusters/loginCopy'
import { LogView } from '@shared/components/clusters/LogView'
import { ReportLink } from '@shared/components/report/ReportLink'
import { IconTile } from '@shared/components/ui/IconTile'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import { BUSY, DUO, type Cluster, type Session } from '@shared/types/clusters'
import { BackLayer, Button, ConfirmDialog, IconBtn, Menu, StatusDot, useToast, type MenuItem, type Tone } from '../ui'
import { SettingsWindow } from './clusters/SettingsWindow'
import { NodeSheet } from './NodeSheet'

const WAITING = 'Requesting compute node'

type Open = '' | 'settings' | 'login' | 'compute' | 'request' | 'phone' | 'release' | 'disconnect'

const AGENTS: [string, string, LucideIcon][] = [['claude', 'Claude', agentIcon('claude')],
  ['codex', 'ChatGPT', agentIcon('codex')], ['agy', 'Antigravity', agentIcon('agy')],
  ['cursor', 'Cursor', agentIcon('cursor')], ['ask', 'Ask all agents', Users]]

function status(s: Session, vpnOnly: boolean): [string, Tone] {
  if (s.state === 'Connected') return [vpnOnly ? 'VPN only' : 'Connected', 'connected']
  if (s.state === 'Error') return ["Didn't connect", 'error']
  if (s.state === 'Disconnected') return ['Not connected', 'off']
  return [s.state === DUO ? 'Approve Duo' : s.state === WAITING ? 'Getting a node' : s.state, 'busy']
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
  const short = shortName(c)
  const [word, tone] = status(s, vpnOnly)
  const close = () => setOpen('')
  const [asked, setAsked] = useState(false)  // the node window opened once for this pick
  useEffect(() => {
    if (s.pick_node && !asked) { setAsked(true); setOpen('request') }
    if (!s.pick_node && asked) setAsked(false)
  }, [s.pick_node, asked])

  const run = (method: string) => call(method, { cluster: c.id }).catch((e: Error) => toast(e.message))

  async function connect(vpn = false) {
    try {
      await call('clusters.connect', { cluster: c.id, vpn_only: vpn, switch: true })
    } catch (e) {
      const msg = (e as Error).message
      if (/username|settings/i.test(msg)) { setHint(msg); setOpen('login') } else toast(msg)
    }
  }

  const a = s.node ? s : null
  const more: MenuItem[][] = [
    [...(connected && a ? [{ label: a.owned ? 'Release node' : 'Stop using this node', icon: Power,
      onClick: () => (a.owned ? setOpen('release') : run('clusters.release_node')) }] : []),
    { label: 'Compute node', icon: Cpu, onClick: () => { setHint(''); setOpen('compute') } },
    { label: 'Sign in', icon: ScanQrCode, onClick: () => { setHint(''); setOpen('login') } }],
    [{ label: 'Connect phone', icon: Smartphone, onClick: () => setOpen('phone') }],
    [...(idle && c.vpn.enabled ? [{ label: 'Connect VPN only', icon: Plug, onClick: () => connect(true) }] : []),
      ...(s.state === 'Connected' ? [{ label: 'Disconnect', icon: Power, danger: true,
        onClick: () => (a?.owned ? setOpen('disconnect') : run('clusters.disconnect')) }] : [])],
  ]
  const agents: MenuItem[][] = [AGENTS.map(([start, label, icon]) => ({ label, icon,
    onClick: () => go('agents', { cluster: c.id, start }) }))]
  const stop = s.state === 'Disconnecting' ? 'Disconnecting' : s.state === WAITING ? 'Stop waiting' : 'Stop signing in'

  return (
    <section aria-label={c.name} className="relative bg-card">
      <div className="flex items-center gap-2 pt-3 pr-2 pl-4">
        <span className="mr-1"><IconTile icon={Server} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg leading-[22px] font-semibold">{c.name}</h2>
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap
            ${tone === 'error' ? 'text-bad' : tone === 'off' ? 'text-dim' : ''}`}><StatusDot tone={tone} />{word}</span>
        </div>
        <IconBtn icon={Settings} label={`${short} settings`} onClick={() => { setHint(''); setOpen('settings') }} />
        <Menu groups={more} label={`More for ${short}`} trigger={<MoreVertical size={20} />}
          className="grid size-10 shrink-0 place-items-center rounded-md text-dim active:bg-pressed" />
      </div>

      <div className="flex flex-col gap-3 px-4 pt-3 pb-3.5">
        {(busy || (s.detail && !vpnOnly && !connected)) && (
          <div className={`flex items-center gap-2 break-words ${s.state === 'Error' ? 'text-bad' : ''}`}>
            {busy && <Spinner />}
            <span className={`min-w-0 ${s.state === DUO ? 'font-semibold' : ''}`}>{s.detail}</span>
            {s.state === 'Error' && s.detail && <ReportLink className="ml-auto py-1" error={`${c.name}: ${s.detail}`}
              cluster={c.id} />}
          </div>
        )}
        {s.state === WAITING && <p className="-mt-1 text-sm text-dim">
          Waiting for a free node. Usually under a minute, longer when the cluster is busy.</p>}

        {connected && <>
          <div className="flex items-center gap-2.5">
            <Cpu size={16} className="shrink-0 text-dim" />
            {a
              ? <span className="min-w-0 select-text">On node <b>{a.node}</b> <span className="text-dim">· job {a.job}
                  {a.owned ? '' : ', started elsewhere'}{left !== null && ` · ${leftText(left)}`}</span></span>
              : <><span className="text-dim">No compute node</span>
                  <button type="button" onClick={() => setOpen('request')} disabled={busy}
                    className="font-semibold disabled:opacity-50">Get one</button></>}
          </div>
          <div className="mx-auto grid w-full max-w-[320px] grid-cols-2 gap-2 [&>button]:w-full [&>button]:justify-center">
            <ClusterAction icon={SquareTerminal} label="Terminal" onClick={() => go('terminals', { cluster: c.id, new: '1' })} />
            <ClusterAction icon={Code} label="VS Code" onClick={() => go('agents', { cluster: c.id, start: 'vscode' })} />
            <ClusterAction icon={Folder} label="Files" onClick={() => go('files', { cluster: c.id })} />
            <Menu groups={agents} label={`Agents on ${short}`} trigger={<><Bot size={16} className="text-dim" />Agents
              <ChevronDown size={16} className="text-dim" /></>}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-pill px-3.5 font-semibold active:bg-selected" />
          </div>
        </>}

        {(idle || busy || vpnOnly) && (
          <div className="flex items-center justify-end">
            {busy
              ? <Button disabled={s.state === 'Disconnecting'} onClick={() => run('clusters.cancel')}>{stop}</Button>
              : vpnOnly
                ? <Button onClick={() => run('clusters.disconnect')}>Disconnect</Button>
                : <Button kind={primary ? 'primary' : 'plain'} className="min-w-[120px]" onClick={() => connect()}>
                    {s.state === 'Error' ? 'Try again' : 'Connect'}</Button>}
          </div>
        )}
      </div>

      <div className="border-y border-line px-4 py-1"><LogView lines={log} /></div>

      {(open === 'settings' || open === 'login' || open === 'compute') && <SettingsWindow cluster={c} hint={hint}
        start={open === 'settings' ? '' : open} onClose={close} />}
      {open === 'request' && <NodeSheet cluster={c} onClose={close} />}
      {open === 'phone' && <BackLayer onBack={close}><PairPhoneDialog only={[c.id]} onClose={close} /></BackLayer>}
      {open === 'release' && a && <ConfirmDialog title={`Release node ${a.node}?`} danger keep="Keep it"
        confirm="Release node" onConfirm={() => run('clusters.release_node')} onClose={close}
        text={<><p>Anything running on it stops.</p><p>You stay connected, and your files stay where they are.</p></>} />}
      {open === 'disconnect' && a && <ConfirmDialog title={`Disconnect ${short}?`} danger keep="Stay connected"
        confirm="Disconnect" text={`This releases node ${a.node}.`} onConfirm={() => run('clusters.disconnect')}
        onClose={close} />}
    </section>
  )
}
