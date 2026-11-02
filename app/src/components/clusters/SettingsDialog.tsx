// A cluster's settings in style E, the phone's ClusterSettingsSheet at desktop size: a list of sections, each opening
// in the same window, and one Save for all of them. Sign-in (username, password or key) and the compute node
// first; under Advanced the server and VPN, queues, the VS Code job and the agents.
// Saved with cluster_settings.save, which checks every field; logins with clusters.set_login. Passwords go in
// and never come back out.
import { Bot, Code, Cpu, Globe, KeyRound, ListOrdered, Server, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import { secondStep, summary, type AgentId, type AgentSettings, type Cluster, type Logins, type SettingsInfo,
  type VsCode } from '../../types/clusters'
import { NodeFields } from '../e/NodeFields'
import { ConfirmDialog, Note, PickerDialog, type PickerOption } from '../e/parts'
import { EDialog, Field, List, MainButton, NumberRow, Row, Section, Segments, ToggleRow } from '../e/ui'
import { useToast } from '../toast'
import { ASK_VS, ASK_VS_SUB } from '../tools/VsCodeDialog'
import { Spinner } from '../ui'
import { AuthenticatorHelp } from './AuthenticatorHelp'
import { ASK } from './ComputeDialog'
import { KeyPanel, keyHeading, PasswordInstead } from './KeyPanel'
import { KeySetupDialog } from './KeySetupDialog'
import { copy, shortName } from './loginCopy'
import { queueCount, QueueRows } from './QueueRows'
import { CHROME_WINDOW } from './SignIn'
import { putCluster } from './store'

type Part = '' | 'login' | 'compute' | 'server' | 'queues' | 'vscode' | 'agents'
const TITLES: Record<Exclude<Part, ''>, string> = { login: 'Sign-in', compute: 'Compute node',
  server: 'Server and VPN', queues: 'Queues', vscode: 'VS Code job', agents: 'Agents' }

/** Where a caller's start (and its old advanced flag) opens: the advanced part of Sign-in is Server and VPN. */
function firstPart(start: string, advanced: boolean): Part {
  if (!(start in TITLES)) return advanced ? 'server' : ''
  if (advanced && start === 'login') return 'server'
  if (advanced && start === 'compute') return 'queues'
  return start as Part
}

const TARGETS = [['desktop', 'VS Code app'], ['browser', 'Browser']] as const
const PROFILE_KEYS = ['cpus', 'mem_gb', 'time', 'partition', 'account', 'qos', 'gpus', 'gpu_type', 'extra_args'] as const
const VPN_KEYS = ['enabled', 'gateway', 'protocol', 'useragent', 'authgroup', 'same_login_as_ssh', 'split_tunnel',
  'domains', 'routes', 'browser'] as const

const pick = <T extends object, K extends keyof T>(o: T, keys: readonly K[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))

type Choosing = { title: string; value: string; options: PickerOption<string>[]; onPick: (v: string) => void }

/** start: '' for the list, or a section ('login', 'compute', 'server', 'queues', 'vscode', 'agents'). */
export function SettingsDialog({ cluster, hint, onClose, start = '', advanced = false }:
  { cluster: Cluster; hint?: string; onClose: () => void; start?: string; advanced?: boolean }) {
  const toast = useToast()
  const [part, setPart] = useState<Part>(() => firstPart(start, advanced))
  const [d, setD] = useState<Cluster>(cluster)
  const [info, setInfo] = useState<SettingsInfo | null>(null)
  const [saved, setSaved] = useState<Logins | null>(null)
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [vpnUser, setVpnUser] = useState('')
  const [vpnPassword, setVpnPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [usePassword, setUsePassword] = useState(false)  // a key cluster that takes a password too
  // no login yet on a cluster with a portal: set it up there, like the GTK app does on Connect
  const [open, setOpen] = useState<null | 'key' | 'code' | 'forget' | 'leave'>(hint && cluster.portal ? 'key' : null)
  const [choosing, setChoosing] = useState<Choosing | null>(null)
  const [base, setBase] = useState<Cluster | null>(null)  // the settings as loaded, to tell if anything changed

  useEffect(() => {
    call<SettingsInfo>('cluster_settings.get', { cluster: cluster.id })
      .then((got) => { setInfo(got); setD(got.cluster); setBase(got.cluster) }).catch((e: Error) => setError(e.message))
    call<Logins>('clusters.login', { cluster: cluster.id })
      .then((l) => { setSaved(l); setUser(l.ssh.username); setVpnUser(l.vpn.username); setRemember(l.remember ?? true) })
      .catch((e: Error) => setError(e.message))
  }, [cluster.id])

  const up = (change: Partial<Cluster>) => setD((x) => ({ ...x, ...change }))
  const upVpn = (change: Partial<Cluster['vpn']>) => setD((x) => ({ ...x, vpn: { ...x.vpn, ...change } }))
  const upVs = (change: Partial<VsCode>) => setD((x) => ({ ...x, vscode: { ...x.vscode!, ...change } }))
  const upAgent = (id: AgentId, change: Partial<AgentSettings>) =>
    setD((x) => ({ ...x, [id]: { ...x[id]!, ...change } }))

  const changed = (!!base && JSON.stringify(d) !== JSON.stringify(base)) || !!password || !!vpnPassword
    || (!!saved && (user !== saved.ssh.username || vpnUser !== saved.vpn.username
      || remember !== (saved.remember ?? true)))
  const close = () => (changed ? setOpen('leave') : onClose())

  const v = d.vpn
  const ownVpnLogin = v.enabled && !(v.same_login_as_ssh ?? true)
  const win = info?.chrome_window
  const signIn: [string, string][] = [['', 'Built-in window'],
    ...(win && (win.offered || v.browser === win.value) ? [[win.value, CHROME_WINDOW.title] as [string, string]] : [])]
  const label = d.username_label || 'Username'
  const want = d.request_node_on_connect ?? true

  function changes() {
    const out: Record<string, unknown> = {
      host: d.host, port: d.port,
      request_node_on_connect: d.request_node_on_connect, ask_node: d.ask_node, reuse_running_job: d.reuse_running_job,
      queues: d.queues, queue_wait: d.queue_wait, vpn: pick(d.vpn, VPN_KEYS), profile: pick(d.profile, PROFILE_KEYS),
    }
    if (d.vscode) {
      const { setup, command, workdir, open_links, open_in, ask, compute } = d.vscode
      out.vscode = { setup, command, workdir, open_links, open_in, ask, compute: pick(compute, PROFILE_KEYS) }
    }
    for (const a of info?.agents ?? []) {
      const s = d[a.id]
      if (s) out[a.id] = pick(s, ['new_node', 'remote', 'workdir', ...a.options.map((o) => o.key)])
    }
    return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined))
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      putCluster(await call<Cluster>('cluster_settings.save', { cluster: d.id, changes: changes() }))
      if (user.trim()) {
        await call('clusters.set_login', { cluster: d.id, kind: 'ssh', username: user, password, remember })
      }
      if (ownVpnLogin && vpnUser.trim()) {
        await call('clusters.set_login', { cluster: d.id, kind: 'vpn', username: vpnUser, password: vpnPassword,
          remember })
      }
      toast(`${shortName(d)} settings saved`)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  async function forget() {
    try {
      const keep = !d.key_page  // a key cluster has no password: forgetting means the username
      await call('clusters.forget_logins', { cluster: d.id, keep_username: keep })
      if (keep) setSaved((s) => s && { ssh: { ...s.ssh, password: false }, vpn: { ...s.vpn, password: false } })
      else {
        setSaved({ ssh: { username: '', password: false }, vpn: { username: '', password: false } })
        setUser(''); setVpnUser('')
      }
      setPassword(''); setVpnPassword('')
      toast(keep ? 'Saved password removed' : `${label} forgotten`)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  function keyDone(name: string) {
    setOpen(null)
    onClose()
    toast(`Signed in as ${name}. Connecting to ${shortName(d)}`)
    call('clusters.connect', { cluster: d.id }).catch((e: Error) => toast(e.message))
  }

  const choose = (title: string, value: string, options: [string, string][], onPick: (v: string) => void) =>
    setChoosing({ title, value, options: options.map(([value, label]) => ({ value, label })), onPick })

  const keyCluster = !!d.key_page && !usePassword
  const instead = d.key_page && d.password_too
    ? <div className="px-5 pt-4"><PasswordInstead on={usePassword} onChange={setUsePassword} /></div> : null
  // a key cluster has no password to forget: its username goes
  const forgetRow = (d.key_page ? !!saved?.ssh.username : !!saved?.ssh.password) && (
    <Section><Row label={d.key_page ? `Forget ${label}` : copy.forget} danger onPress={() => setOpen('forget')} />
    </Section>)

  const login = keyCluster ? <>
    <p className="px-5 pb-1 text-dim">{keyHeading(d).text}</p>
    <div className="px-5"><KeyPanel cluster={d} user={user} onUser={setUser} /></div>
    {instead}
    {forgetRow}
  </> : <>
    <div className="px-5">
      <Field label={label} value={user} autoFocus placeholder={copy.usernameHint}
        onChange={(e) => setUser(e.target.value)} />
      <Field label={copy.password} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
        placeholder={!remember ? 'Asked when you connect' : saved?.ssh.password ? copy.saved : undefined} />
    </div>
    <Section note={remember ? copy.passwordNote(d) : undefined}>
      <ToggleRow label={copy.remember} sub={remember ? undefined : copy.rememberOff} checked={remember}
        onChange={setRemember} />
    </Section>
    {secondStep(d) && (d.code_setup ? <Section note={secondStep(d)}>
      <Row icon={ShieldCheck} label={copy.codeSetup} opens onPress={() => setOpen('code')} />
    </Section> : <p className="px-5 pt-3 text-sm text-dim">{secondStep(d)}</p>)}
    {d.portal && <Section note={copy.portalNote}>
      <Row icon={Globe} label={copy.portal(d)} opens onPress={() => setOpen('key')} />
    </Section>}
    {instead}
    {forgetRow}
  </>

  const server = <>
    <div className="px-5">
      <Field label="Login host" value={d.host} placeholder="login.example.edu"
        onChange={(e) => up({ host: e.target.value.trim() })} />
    </div>
    <div className="pt-3"><List>
      <NumberRow label="SSH port" unit="" showUnit={false} value={d.port ?? 22} max={65535}
        onChange={(port) => up({ port })} />
    </List></div>
    <Section title="VPN">
      <ToggleRow label="Use VPN" checked={v.enabled} onChange={(enabled) => upVpn({ enabled })} />
    </Section>
    {v.enabled && <>
      <div className="px-5 pt-3">
        <Field label="Gateway" value={v.gateway} placeholder="vpn.example.edu"
          onChange={(e) => upVpn({ gateway: e.target.value })} />
        {signIn.length > 1 && <div className="py-1.5">
          <p className="mb-1.5 text-sm text-dim">Sign in with</p>
          <Segments label="Sign in with" value={v.browser ?? ''} options={signIn}
            onChange={(browser) => upVpn({ browser })} />
        </div>}
      </div>
      <div className="pt-4"><List>
        <Row label="Protocol" value={v.protocol ?? 'anyconnect'} opens onPress={() => choose('Protocol',
          v.protocol ?? 'anyconnect', (info?.protocols ?? [v.protocol ?? 'anyconnect']).map((p) => [p, p]),
          (protocol) => upVpn({ protocol }))} />
        <ToggleRow label="Split tunnel" sub="Only these networks and domains use this VPN, so other VPNs can run too."
          checked={v.split_tunnel ?? true} onChange={(split_tunnel) => upVpn({ split_tunnel })} />
      </List></div>
      <div className="px-5 pt-3">
        {(v.split_tunnel ?? true) && <>
          <Field label="VPN domains" value={v.domains ?? ''} placeholder="example.edu"
            onChange={(e) => upVpn({ domains: e.target.value })} />
          <Field label="VPN networks, space separated" value={v.routes ?? ''} placeholder="10.0.0.0/16"
            onChange={(e) => upVpn({ routes: e.target.value })} />
        </>}
        <Field label="User agent (optional)" value={v.useragent ?? ''}
          onChange={(e) => upVpn({ useragent: e.target.value })} />
        <Field label="Group (optional)" value={v.authgroup ?? ''}
          onChange={(e) => upVpn({ authgroup: e.target.value })} />
      </div>
    </>}
    {v.enabled && <Section title="VPN login">
      <ToggleRow label="Same login as the cluster" checked={v.same_login_as_ssh ?? true}
        onChange={(same_login_as_ssh) => upVpn({ same_login_as_ssh })} />
    </Section>}
    {ownVpnLogin && <div className="px-5 pt-2">
      <Field label="VPN username" value={vpnUser} placeholder="jdoe@example.edu"
        onChange={(e) => setVpnUser(e.target.value)} />
      <Field label="VPN password" type="password" value={vpnPassword} onChange={(e) => setVpnPassword(e.target.value)}
        placeholder={saved?.vpn.password ? copy.saved : 'Same as the cluster password'} />
    </div>}
  </>

  const compute = <>
    <List>
      <ToggleRow label="Get a compute node when I connect" sub="Your terminals and agents run there."
        checked={want} onChange={(on) => up({ request_node_on_connect: on })} />
    </List>
    {want && <div className="pt-5">
      <NodeFields cluster={d.id} value={d.profile} onChange={(profile) => up({ profile })} /></div>}
    <Section>
      {want && <ToggleRow label={ASK} sub="Shows the node window when you connect." checked={d.ask_node ?? false}
        onChange={(on) => up({ ask_node: on })} />}
      <ToggleRow label="Reuse a node you already have" sub="One an agent or VS Code got earlier."
        checked={d.reuse_running_job ?? true} onChange={(on) => up({ reuse_running_job: on })} />
    </Section>
  </>

  const queues = <>
    <h3 className="px-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Tried in this order</h3>
    <QueueRows cluster={d.id} value={d.queues ?? ''} onChange={(queues) => up({ queues })} />
    <p className="px-5 pt-2 text-sm text-dim">Cheapest first. Your node comes from the first one that can start
      within the wait below.</p>
    <div className="pt-5"><List>
      <NumberRow label="Wait for a cheaper queue" unit="seconds" min={0} max={3600} value={d.queue_wait ?? 60}
        onChange={(queue_wait) => up({ queue_wait })} />
    </List></div>
  </>

  const vs = d.vscode
  const vscode = vs ? <>
    <div className="px-5">
      <Field label="Runs first" value={vs.setup} placeholder="module load VSCode"
        onChange={(e) => upVs({ setup: e.target.value })} />
      <Field label="Command" value={vs.command} onChange={(e) => upVs({ command: e.target.value })} />
      <Field label="Folder it opens" value={vs.workdir === '~' ? '' : vs.workdir} placeholder="Home folder"
        onChange={(e) => upVs({ workdir: e.target.value || '~' })} />
      <div className="py-1.5">
        <p className="mb-1.5 text-sm text-dim">Open in</p>
        <Segments label="Open in" value={vs.open_in} options={TARGETS} onChange={(open_in) => upVs({ open_in })} />
      </div>
    </div>
    <Section>
      <ToggleRow label="Open automatically" sub="When the tunnel is ready, and the GitHub sign-in page."
        checked={vs.open_links} onChange={(open_links) => upVs({ open_links })} />
      <ToggleRow label={ASK_VS} sub={ASK_VS_SUB} checked={vs.ask ?? true} onChange={(ask) => upVs({ ask })} />
    </Section>
    <h3 className="px-5 pt-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Its own node</h3>
    <NodeFields cluster={d.id} value={vs.compute} onChange={(compute) => upVs({ compute })} />
  </> : <p className="px-5 text-dim">No VS Code settings here.</p>

  const agents = (info?.agents ?? []).map((a) => {
    const s = d[a.id]
    if (!s) return null
    return (
      <Section key={a.id} title={a.name}>
        <ToggleRow label="Its own compute node" sub={s.new_node ? undefined : 'Runs on the node you have.'}
          checked={s.new_node} onChange={(new_node) => upAgent(a.id, { new_node })} />
        {a.remote_label && <ToggleRow label={a.remote_label} sub={a.remote_hint} checked={s.remote}
          onChange={(remote) => upAgent(a.id, { remote })} />}
        {a.options.map((o) => (
          <Row key={o.key} label={o.label} value={o.choices.find(([x]) => x === s[o.key])?.[1] ?? 'Default'} opens
            onPress={() => choose(o.label, String(s[o.key] ?? ''), o.choices,
              (x) => upAgent(a.id, { [o.key]: x }))} />
        ))}
        <div className="border-b border-line px-5 pb-2">
          <Field label="Folder it starts in" value={s.workdir === '~' ? '' : s.workdir} placeholder="Home folder"
            onChange={(e) => upAgent(a.id, { workdir: e.target.value || '~' })} />
        </div>
      </Section>
    )
  })

  const list = !info ? <div className="grid h-40 place-items-center"><Spinner size={28} /></div> : <>
    <List>
      <Row icon={KeyRound} label="Sign-in" value={user || 'Not set'} opens onPress={() => setPart('login')} />
      {d.second_factor === 'code' && d.code_setup && <Row icon={ShieldCheck} label="Authenticator app" opens
        onPress={() => setOpen('code')} />}
      <Row icon={Cpu} label="Compute node" sub={want ? summary(d.profile) : 'Off'} opens
        onPress={() => setPart('compute')} />
    </List>
    <Section title="Advanced" note="Changes apply the next time you connect.">
      <Row icon={Server} label="Server and VPN" value={d.host} opens onPress={() => setPart('server')} />
      <Row icon={ListOrdered} label="Queues" value={queueCount(d.queues)} opens onPress={() => setPart('queues')} />
      {d.vscode && <Row icon={Code} label="VS Code job" opens onPress={() => setPart('vscode')} />}
      {!!info.agents.length && <Row icon={Bot} label="Agents" sub={info.agents.map((a) => a.name).join(', ')} opens
        onPress={() => setPart('agents')} />}
    </Section>
  </>

  const pages: Record<Part, ReactNode> = { '': list, login, compute, server, queues, vscode, agents }
  const back = () => setPart('')
  return (
    <>
      <EDialog title={part ? TITLES[part] : `${cluster.name} settings`} width={580} onClose={close}
        onBack={part ? back : undefined}
        actions={part ? <MainButton onClick={back}>Done</MainButton>
          : <MainButton disabled={busy || !saved || !info} onClick={save}>Save</MainButton>}>
        {hint && (part === '' || part === 'login') && <Note>{hint}</Note>}
        {error && <Note error>{error}</Note>}
        <div className="pb-3">{pages[part]}</div>
      </EDialog>
      {open === 'leave' && <ConfirmDialog title="Throw away your changes?" danger keep="Keep editing"
        confirm="Throw away" onClose={() => setOpen(null)} onConfirm={onClose} />}
      {open === 'key' && <KeySetupDialog cluster={d} onClose={() => setOpen(null)} onDone={keyDone} />}
      {open === 'code' && <AuthenticatorHelp cluster={d} onClose={() => setOpen(null)} />}
      {open === 'forget' && <ConfirmDialog danger title={d.key_page ? `Forget your ${label}?` : copy.forgetTitle(d)}
        keep={copy.keep} confirm={d.key_page ? `Forget ${label}` : copy.forget} onConfirm={forget}
        onClose={() => setOpen(null)}
        text={d.key_page ? "You'll type it next time you connect. Your key stays on this computer."
          : copy.forgetBody(label)} />}
      {choosing && <PickerDialog title={choosing.title} value={choosing.value} options={choosing.options}
        onPick={choosing.onPick} onClose={() => setChoosing(null)} />}
    </>
  )
}
