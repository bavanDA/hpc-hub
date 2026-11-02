// A cluster's settings, like the GTK app's settings.py: sections in a list down the left. Sign-in (username,
// password or key) and Compute (the node) first; under Advanced the server and VPN, queues, the VS Code job and
// the agents.
// Saved with cluster_settings.save, which checks every field; logins with clusters.set_login. Passwords go in
// and never come back out.
import { ExternalLink, KeyRound, Lock } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import { secondStep, type AgentId, type AgentSettings, type Cluster, type Limits, type Logins, type Profile,
  type SettingsInfo, type VsCode } from '../../types/clusters'
import { openSystem } from '../app/openLink'
import { useToast } from '../toast'
import { ASK_VS, ASK_VS_SUB } from '../tools/VsCodeDialog'
import { AlertDialog, Button, Dialog, List } from '../ui'
import { Duration, GpuPicker } from './ComputeDialog'
import { useGpus } from './gpus'
import { ActionRow, ComboRow, EntryRow, Group, NumberBox, SpinRow, SwitchRow } from './fields'
import { KeyPanel, keyHeading, PasswordInstead } from './KeyPanel'
import { KeySetupDialog } from './KeySetupDialog'
import { copy } from './loginCopy'
import { CHROME_WINDOW } from './SignIn'
import { QueueRows } from './QueueRows'
import { putCluster } from './store'
import { minutes, slurmTime } from './time'

const MAIN = [['login', 'Sign-in'], ['compute', 'Compute']] as const
const ADVANCED = [['server', 'Server and VPN'], ['queues', 'Queues'], ['vscode', 'VS Code'],
  ['agents', 'Agents']] as const
export type Tab = typeof MAIN[number][0] | typeof ADVANCED[number][0]
const TABS: readonly (readonly [Tab, string])[] = [...MAIN, ...ADVANCED]

/** Where a caller's start (and its old advanced flag) opens: the advanced part of Sign-in is Server and VPN. */
function firstTab(start: string, advanced: boolean): Tab {
  if (!TABS.some(([t]) => t === start)) return advanced ? 'server' : 'login'
  if (advanced && start === 'login') return 'server'
  if (advanced && start === 'compute') return 'queues'
  return start as Tab
}

function NavItem({ id, label, on, pick }: { id: Tab; label: string; on: boolean; pick: (t: Tab) => void }) {
  return (
    <button type="button" role="tab" aria-selected={on} onClick={() => pick(id)}
      className={`flex h-8 w-full items-center rounded-md px-3 text-left text-base transition-colors duration-90 ${
        on ? 'bg-selected font-semibold' : 'text-dim hover:bg-hover hover:text-text'}`}>{label}</button>
  )
}

const TARGETS: [string, string][] = [['desktop', 'VS Code app'], ['browser', 'Browser (vscode.dev)']]
const PROFILE_KEYS = ['cpus', 'mem_gb', 'time', 'partition', 'account', 'qos', 'gpus', 'gpu_type', 'extra_args'] as const
const VPN_KEYS = ['enabled', 'gateway', 'protocol', 'useragent', 'authgroup', 'same_login_as_ssh', 'split_tunnel',
  'domains', 'routes', 'browser'] as const

const pick = <T extends object, K extends keyof T>(o: T, keys: readonly K[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))


/** Cores, memory, GPUs, time, partition, account, QOS and extra arguments (settings.py ProfileRows). */
function ProfileRows({ cluster, p, onChange, extra, rows = 'all', billing = true }:
  { cluster: string; p: Profile; onChange: (p: Profile) => void; extra: string; rows?: 'all' | 'size' | 'more'
    billing?: boolean }) {
  const [limits, setLimits] = useState<Limits | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      call<Limits>('clusters.partitions', { cluster, partition: p.partition, qos: p.qos ?? '' })
        .then(setLimits).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [cluster, p.partition, p.qos])
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  const { gpus, known } = useGpus(cluster)
  return <>
    {rows !== 'more' && <>
      <SpinRow label="Cores" value={p.cpus} onChange={(cpus) => set({ cpus })} min={1} max={512} />
      <SpinRow label="Memory" unit="GB" value={p.mem_gb} onChange={(mem_gb) => set({ mem_gb })} min={1} max={4096} />
      <Duration total={minutes(p.time) ?? 240} onChange={(m) => set({ time: slurmTime(m) })} limits={limits} />
      <div className="px-4 pt-3 text-sm font-semibold text-dim">GPU</div>
      <GpuPicker gpus={gpus} known={known} value={p} onChange={onChange} />
      <EntryRow label="Queue" value={p.partition} onChange={(partition) => set({ partition })}
        list={limits?.partitions} placeholder={limits?.default_partition} />
    </>}
    {rows !== 'size' && <More p={p} set={set} limits={limits} extra={extra} billing={billing} />}
  </>
}

/** billing: off where each queue row sets its own. */
function More({ p, set, limits, extra, billing }:
  { p: Profile; set: (c: Partial<Profile>) => void; limits: Limits | null; extra: string; billing: boolean }) {
  return <>
    <EntryRow label="Group to bill" value={p.account ?? ''} onChange={(account) => set({ account })} />
    {billing && <EntryRow label="Billing" value={p.qos ?? ''} onChange={(qos) => set({ qos })} list={limits?.qos}
      placeholder={limits?.default_qos} />}
    <EntryRow label={extra} value={p.extra_args ?? ''} onChange={(extra_args) => set({ extra_args })}
      placeholder="--constraint=gpu" />
  </>
}

export function SettingsDialog({ cluster, hint, onClose, start = 'login', advanced = false }:
  { cluster: Cluster; hint?: string; onClose: () => void; start?: string; advanced?: boolean }) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>(() => firstTab(start, advanced))
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
  const [open, setOpen] = useState<null | 'key'>(hint && cluster.portal ? 'key' : null)
  const [base, setBase] = useState<Cluster | null>(null)  // the settings as loaded, to tell if anything changed
  const [asking, setAsking] = useState(false)  // "Throw away your changes?"

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
  const close = () => (changed ? setAsking(true) : onClose())

  const v = d.vpn
  const code = d.second_factor === 'code'
  const ownVpnLogin = v.enabled && !(v.same_login_as_ssh ?? true)
  const win = info?.chrome_window
  const signIn: [string, string][] = [['', 'Built-in window'],
    ...(win && (win.offered || v.browser === win.value) ? [[win.value, CHROME_WINDOW.title] as [string, string]] : [])]

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
      toast(`${d.name} settings saved`)
      onClose()
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  const [forgetting, setForgetting] = useState(false)
  async function forget() {
    setForgetting(false)
    try {
      const keep = !d.key_page  // a key cluster has no password: forgetting means the username
      await call('clusters.forget_logins', { cluster: d.id, keep_username: keep })
      if (keep) setSaved((s) => s && { ssh: { ...s.ssh, password: false }, vpn: { ...s.vpn, password: false } })
      else {
        setSaved({ ssh: { username: '', password: false }, vpn: { username: '', password: false } })
        setUser(''); setVpnUser('')
      }
      setPassword(''); setVpnPassword('')
      toast('Saved password removed')
    } catch (e) {
      toast((e as Error).message)
    }
  }

  function keyDone(name: string) {
    setOpen(null)
    onClose()
    toast(`Signed in as ${name}. Connecting to ${d.name}`)
    call('clusters.connect', { cluster: d.id }).catch((e: Error) => toast(e.message))
  }

  const instead = d.key_page && d.password_too
    ? <div className="-mt-2 mb-5 flex"><PasswordInstead on={usePassword} onChange={setUsePassword} /></div> : null
  // the one destructive thing here: a row of its own at the bottom, with a soft red button that asks first
  const forgetRow = (what: string) => (
    <Group>
      <ActionRow label={`Forget ${what}`}>
        <Button kind="danger-solid" size="sm" type="button" onClick={() => setForgetting(true)}>Forget</Button>
      </ActionRow>
    </Group>
  )
  const keyText = keyHeading(d).text
  const login = d.key_page && !usePassword ? <>
    {keyText && <p className="mb-3 text-base text-dim">{keyText}</p>}
    <div className="mb-3"><KeyPanel cluster={d} user={user} onUser={setUser} /></div>
    {instead}
    {forgetRow(d.username_label || 'username')}
  </> : <>
    <List>
      <EntryRow label={d.username_label || 'Username'} value={user} onChange={setUser} autoFocus
        placeholder={copy.usernameHint} />
      <EntryRow label={copy.password} value={password} onChange={setPassword} password
        placeholder={!remember ? 'Asked when you connect' : saved?.ssh.password ? copy.saved : undefined} />
      <SwitchRow label={copy.remember} checked={remember} onChange={setRemember}
        sub={remember ? undefined : copy.rememberOff} />
    </List>
    <div className="mb-5 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-sm text-dim">
      {remember && <span className="flex items-center gap-1.5"><Lock size={14} />{copy.passwordNote(d)}</span>}
      {secondStep(d) && <span>{secondStep(d)}</span>}
      {code && d.code_setup && <button type="button" onClick={() => openSystem(d.code_setup!)}
        className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline">
        {copy.codeSetup}<ExternalLink size={14} /></button>}
    </div>
    {instead}
    {d.portal && (
      <div className="mb-5 flex items-center gap-4 rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-card)]">
        <KeyRound size={20} className="shrink-0 text-dim" />
        <p className="min-w-0 flex-1 text-base">Skip the password: add this computer's SSH key through the portal.
          <span className="text-dim"> You'll still need the code.</span></p>
        <Button type="button" onClick={() => setOpen('key')}>{copy.portal(d)}</Button>
      </div>
    )}
    {forgetRow('saved password')}
  </>

  const server = <>
    <Group title="Server">
      <EntryRow label="Login host" value={d.host} onChange={(h) => up({ host: h })} placeholder="login.example.edu" />
      <ActionRow label="SSH port">
        <NumberBox label="SSH port" value={d.port ?? 22} onChange={(port) => up({ port })} min={1} max={65535}
          width={72} />
      </ActionRow>
    </Group>
    <Group title="VPN">
      <SwitchRow label="Use VPN" checked={v.enabled} onChange={(enabled) => upVpn({ enabled })} />
      {v.enabled && <>
        <EntryRow label="Gateway" value={v.gateway} onChange={(gateway) => upVpn({ gateway })}
          placeholder="vpn.example.edu" />
        <ComboRow label="Sign in with" value={v.browser ?? ''}
          sub="The Chrome window remembers your sign-in, so it is quicker"
          options={signIn}
          onChange={(browser) => upVpn({ browser })} />
        <ComboRow label="Protocol" value={v.protocol ?? 'anyconnect'} onChange={(protocol) => upVpn({ protocol })}
          options={(info?.protocols ?? [v.protocol ?? 'anyconnect']).map((p): [string, string] => [p, p])} />
        <EntryRow label="User agent (optional)" value={v.useragent ?? ''} onChange={(useragent) => upVpn({ useragent })} />
        <EntryRow label="Group (optional)" value={v.authgroup ?? ''} onChange={(authgroup) => upVpn({ authgroup })} />
        <SwitchRow label="Split tunnel" checked={v.split_tunnel ?? true}
          sub="Only these networks and domains use this VPN, so other VPNs can run too"
          onChange={(split_tunnel) => upVpn({ split_tunnel })} />
        {(v.split_tunnel ?? true) && <>
          <EntryRow label="VPN domains (its DNS answers these)" value={v.domains ?? ''}
            onChange={(domains) => upVpn({ domains })} placeholder="example.edu" />
          <EntryRow label="VPN networks (CIDR, space separated)" value={v.routes ?? ''}
            onChange={(routes) => upVpn({ routes })} placeholder="10.0.0.0/16" />
        </>}
      </>}
    </Group>
    {v.enabled && (
      <Group title="VPN login">
        <SwitchRow label="Same login as cluster" checked={v.same_login_as_ssh ?? true}
          onChange={(same_login_as_ssh) => upVpn({ same_login_as_ssh })} />
        {ownVpnLogin && <>
          <EntryRow label="VPN username" value={vpnUser} onChange={setVpnUser} placeholder="jane.doe@example.edu" />
          <EntryRow label="VPN password" value={vpnPassword} onChange={setVpnPassword} password
            placeholder={saved?.vpn.password ? copy.saved : 'Same as the cluster password'} />
        </>}
      </Group>
    )}
  </>

  const compute = <>
    <Group description="Your terminals and agents run on a compute node, not the busy login node.">
      <SwitchRow label="Get a compute node when I connect" checked={d.request_node_on_connect ?? true}
        onChange={(request_node_on_connect) => up({ request_node_on_connect })} />
      {(d.request_node_on_connect ?? true) && (
        <SwitchRow label="Ask before each request" checked={d.ask_node ?? false}
          onChange={(ask_node) => up({ ask_node })} />
      )}
      <SwitchRow label="Reuse a node you already have" checked={d.reuse_running_job ?? true}
        onChange={(reuse_running_job) => up({ reuse_running_job })} />
    </Group>
    <Group title="Node size">
      <ProfileRows cluster={d.id} p={d.profile} onChange={(profile) => up({ profile })} rows="size"
        extra="Extra options" />
    </Group>
  </>

  const queues = <>
    <Group title="Group and options">
      <ProfileRows cluster={d.id} p={d.profile} onChange={(profile) => up({ profile })} rows="more"
        extra="Extra options" billing={!(d.queues ?? '').trim()} />
    </Group>
    <Group title="Queues to try"
      description="Cheapest first. Your node comes from the first one that can start within the wait below.">
      <QueueRows cluster={d.id} value={d.queues ?? ''} onChange={(queues) => up({ queues })} />
      <SpinRow label="Wait for a cheaper queue (seconds)" value={d.queue_wait ?? 60}
        onChange={(queue_wait) => up({ queue_wait })} min={0} max={3600} />
    </Group>
  </>

  const vs = d.vscode
  const vscode = vs && <>
    <Group title="VS Code job">
      <EntryRow label="Run first (for example module load VSCode)" value={vs.setup} onChange={(setup) => upVs({ setup })} />
      <EntryRow label="Command" value={vs.command} onChange={(command) => upVs({ command })} />
      <EntryRow label="Start in folder" value={vs.workdir} onChange={(workdir) => upVs({ workdir })} placeholder="~" />
      <ComboRow label="Open in" value={vs.open_in} options={TARGETS}
        onChange={(x) => upVs({ open_in: x as VsCode['open_in'] })} />
      <SwitchRow label="Open automatically" sub="When the tunnel is ready, and the GitHub sign-in page"
        checked={vs.open_links} onChange={(open_links) => upVs({ open_links })} />
      <SwitchRow label={ASK_VS} sub={ASK_VS_SUB} checked={vs.ask ?? true} onChange={(ask) => upVs({ ask })} />
    </Group>
    <Group title="Node size" description="VS Code gets its own node with this size.">
      <ProfileRows cluster={d.id} p={vs.compute} onChange={(c) => upVs({ compute: c })} extra="Extra options" />
    </Group>
  </>

  const agents = <>
    <p className="mb-3 text-sm text-dim">What each agent starts with. You can change these when you start one
      too.</p>
    {(info?.agents ?? []).map((a) => {
      const s = d[a.id]
      if (!s) return null
      return (
        <Group key={a.id} title={a.name}>
          {a.options.map((o) => (
            <ComboRow key={o.key} label={o.label} value={String(s[o.key] ?? '')} options={o.choices}
              onChange={(x) => upAgent(a.id, { [o.key]: x })} />
          ))}
          <SwitchRow label="Use a new compute node" checked={s.new_node}
            sub={s.new_node ? 'A node of its own' : 'Shares your compute node'} onChange={(new_node) => upAgent(a.id, { new_node })} />
          {a.remote_label && <SwitchRow label={a.remote_label} sub={a.remote_hint} checked={s.remote}
            onChange={(remote) => upAgent(a.id, { remote })} />}
          <EntryRow label="Start in folder" value={s.workdir} onChange={(workdir) => upAgent(a.id, { workdir })}
            placeholder="~" />
        </Group>
      )
    })}
  </>

  const pages: Record<Tab, ReactNode> = {
    login, compute, server, queues, vscode: vscode || <p className="text-dim">No VS Code settings here.</p>, agents,
  }
  const title = TABS.find(([t]) => t === tab)?.[1] ?? ''
  return (
    <>
      <Dialog title={`${d.name} settings`} onClose={close} width={780} height={640} bare
        actions={<>
          <span className="mr-auto text-sm text-dim">Changes apply the next time you connect.</span>
          <Button kind="ghost" onClick={close}>Cancel</Button>
          <Button kind="primary" disabled={busy || !saved || !info} onClick={save}>Save</Button>
        </>}>
        <nav role="tablist" aria-orientation="vertical" aria-label="Settings sections"
          className="flex w-48 shrink-0 flex-col gap-0.5 rounded-bl-2xl bg-sidebar p-2">
          {MAIN.map(([t, label]) => <NavItem key={t} id={t} label={label} on={tab === t} pick={setTab} />)}
          <p className="mt-4 mb-1 px-3 text-xs font-semibold text-dim">Advanced</p>
          {ADVANCED.map(([t, label]) => <NavItem key={t} id={t} label={label} on={tab === t} pick={setTab} />)}
        </nav>
        <div role="tabpanel" aria-label={title} className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
          <h3 className="mb-4 text-lg font-semibold">{title}</h3>
          {hint && <p className="mb-4 rounded-lg bg-warn-bg px-4 py-2.5 text-base font-semibold text-warn">{hint}</p>}
          {error && <p role="alert" className="mb-4 rounded-lg bg-bad-bg px-4 py-2.5 text-base font-semibold text-bad">
            {error}</p>}
          {pages[tab]}
        </div>
      </Dialog>
      {asking && <AlertDialog title="Throw away your changes?" keep="Keep editing" act="Throw away"
        onClose={() => setAsking(false)} onAct={onClose} />}
      {open === 'key' && <KeySetupDialog cluster={d} onClose={() => setOpen(null)} onDone={keyDone} />}
      {forgetting && <AlertDialog title={d.key_page ? `Forget your ${d.username_label || 'username'}?`
        : copy.forgetTitle(d)} keep={copy.keep} act={d.key_page ? 'Forget' : copy.forget}
        onAct={forget} onClose={() => setForgetting(false)}>
        {d.key_page ? "You'll type it next time you connect. Your key stays on this computer."
          : copy.forgetBody(d.username_label || 'username')}</AlertDialog>}
    </>
  )
}
