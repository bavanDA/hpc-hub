// A cluster's settings, like the GTK app's settings.py: login (system keyring), server and VPN, compute node
// and queues, the VS Code job and the agents. Saved with cluster_settings.save, which checks every field;
// logins with clusters.set_login. Passwords go in and never come back out.
import { CircleHelp, KeyRound } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import { secondStep, type AgentId, type AgentSettings, type Cluster, type Limits, type Logins, type Profile,
  type SettingsInfo, type VsCode } from '../../types/clusters'
import { keyStore } from '../app/platform'
import { useToast } from '../toast'
import { Button, Dialog } from '../ui'
import { AuthenticatorHelp } from './AuthenticatorHelp'
import { Duration } from './ComputeDialog'
import { ActionRow, ButtonRow, ComboRow, EntryRow, Group, NumberBox, SpinRow, SwitchRow } from './fields'
import { KeyPanel, PasswordInstead } from './KeyPanel'
import { KeySetupDialog } from './KeySetupDialog'
import { copy } from './loginCopy'
import { CHROME_WINDOW } from './SignIn'
import { putCluster } from './store'
import { minutes, slurmTime } from './time'

const TABS = [['login', 'Login'], ['server', 'Server & VPN'], ['compute', 'Compute'], ['vscode', 'VS Code'],
  ['agents', 'Agents']] as const
export type Tab = typeof TABS[number][0]

const TARGETS: [string, string][] = [['desktop', 'VS Code app'], ['browser', 'Browser (vscode.dev)']]
const PROFILE_KEYS = ['cpus', 'mem_gb', 'time', 'partition', 'account', 'qos', 'gpus', 'extra_args'] as const
const VPN_KEYS = ['enabled', 'gateway', 'protocol', 'useragent', 'authgroup', 'same_login_as_ssh', 'split_tunnel',
  'domains', 'routes', 'browser'] as const

const pick = <T extends object, K extends keyof T>(o: T, keys: readonly K[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))

function host(url: string) {
  try { return new URL(url).hostname } catch { return url }
}

/** Cores, memory, GPUs, time, partition, account, QOS and extra arguments (settings.py ProfileRows). */
function ProfileRows({ cluster, p, onChange, extra }:
  { cluster: string; p: Profile; onChange: (p: Profile) => void; extra: string }) {
  const [limits, setLimits] = useState<Limits | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      call<Limits>('clusters.partitions', { cluster, partition: p.partition, qos: p.qos ?? '' })
        .then(setLimits).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [cluster, p.partition, p.qos])
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  return <>
    <SpinRow label="CPU cores" value={p.cpus} onChange={(cpus) => set({ cpus })} min={1} max={512} />
    <SpinRow label="Memory (GB)" value={p.mem_gb} onChange={(mem_gb) => set({ mem_gb })} min={1} max={4096} />
    <SpinRow label="GPUs" value={p.gpus ?? 0} onChange={(gpus) => set({ gpus })} min={0} max={16} />
    <Duration total={minutes(p.time) ?? 240} onChange={(m) => set({ time: slurmTime(m) })} limits={limits} />
    <EntryRow label="Partition" value={p.partition} onChange={(partition) => set({ partition })}
      list={limits?.partitions} placeholder={limits?.default_partition} />
    <EntryRow label="Account" value={p.account ?? ''} onChange={(account) => set({ account })} />
    <EntryRow label="QOS" value={p.qos ?? ''} onChange={(qos) => set({ qos })} list={limits?.qos}
      placeholder={limits?.default_qos} />
    <EntryRow label={extra} value={p.extra_args ?? ''} onChange={(extra_args) => set({ extra_args })}
      placeholder="--constraint=gpu" />
  </>
}

export function SettingsDialog({ cluster, hint, onClose, start = 'login' }:
  { cluster: Cluster; hint?: string; onClose: () => void; start?: Tab }) {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>(start)
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
  const [open, setOpen] = useState<null | 'help' | 'key'>(hint && cluster.portal ? 'key' : null)

  useEffect(() => {
    call<SettingsInfo>('cluster_settings.get', { cluster: cluster.id })
      .then((got) => { setInfo(got); setD(got.cluster) }).catch((e: Error) => setError(e.message))
    call<Logins>('clusters.login', { cluster: cluster.id })
      .then((l) => { setSaved(l); setUser(l.ssh.username); setVpnUser(l.vpn.username); setRemember(l.remember ?? true) })
      .catch((e: Error) => setError(e.message))
  }, [cluster.id])

  const up = (change: Partial<Cluster>) => setD((x) => ({ ...x, ...change }))
  const upVpn = (change: Partial<Cluster['vpn']>) => setD((x) => ({ ...x, vpn: { ...x.vpn, ...change } }))
  const upVs = (change: Partial<VsCode>) => setD((x) => ({ ...x, vscode: { ...x.vscode!, ...change } }))
  const upAgent = (id: AgentId, change: Partial<AgentSettings>) =>
    setD((x) => ({ ...x, [id]: { ...x[id]!, ...change } }))

  const v = d.vpn
  const code = d.second_factor === 'code'
  const ownVpnLogin = v.enabled && !(v.same_login_as_ssh ?? true)
  const win = info?.chrome_window
  const signIn: [string, string][] = [['', 'This app (fills your login)'],
    ...(win && (win.offered || v.browser === win.value) ? [[win.value, CHROME_WINDOW.title] as [string, string]] : [])]

  function changes() {
    const out: Record<string, unknown> = {
      host: d.host, port: d.port,
      request_node_on_connect: d.request_node_on_connect, ask_node: d.ask_node, reuse_running_job: d.reuse_running_job,
      queues: d.queues, queue_wait: d.queue_wait, vpn: pick(d.vpn, VPN_KEYS), profile: pick(d.profile, PROFILE_KEYS),
    }
    if (d.vscode) {
      const { setup, command, workdir, open_links, open_in, compute } = d.vscode
      out.vscode = { setup, command, workdir, open_links, open_in, compute: pick(compute, PROFILE_KEYS) }
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

  async function forget() {
    try {
      await call('clusters.forget_logins', { cluster: d.id })
      setSaved({ ssh: { username: '', password: false }, vpn: { username: '', password: false } })
      setUser(''); setPassword(''); setVpnUser(''); setVpnPassword('')
      toast('Saved logins removed')
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
  const login = d.key_page && !usePassword ? <>
    <Group title="Cluster login" description={copy.keyIntro(d)}>
      <ActionRow label={secondStep(d)} sub="Set by the cluster's admins">{null}</ActionRow>
    </Group>
    <div className="mb-5"><KeyPanel cluster={d} user={user} onUser={setUser} /></div>
    {instead}
    <Group><ButtonRow label="Forget saved logins" tone="bad" onClick={forget} /></Group>
  </> : <>
    <Group title="Cluster login" description={d.password_only ? copy.passwordNote(d) : copy.savedIn(keyStore)}>
      <EntryRow label="Username" value={user} onChange={setUser} autoFocus placeholder="jdoe" />
      <EntryRow label={!remember ? 'Password (optional: asked when you connect)'
        : saved?.ssh.password ? 'Password (saved, leave empty to keep)' : 'Password'}
        value={password} onChange={setPassword} password />
      <SwitchRow label="Remember my password" checked={remember} onChange={setRemember}
        sub={remember ? undefined : 'Not saved. HPC Hub asks once after it starts and forgets it when you quit'} />
      <ActionRow label={secondStep(d)} sub="Set by the cluster's admins">{null}</ActionRow>
      {code && <ButtonRow label="How to set up Google Authenticator" icon={<CircleHelp size={16} />}
        onClick={() => setOpen('help')} />}
    </Group>
    {instead}
    {d.portal && (
      <Group title="Web portal"
        description={`No password yet? Sign in at ${host(d.portal)} in a window HPC Hub opens, and the app adds this
          computer's SSH key to your account, then logs in with it.`}>
        <ButtonRow label={`Log in through ${host(d.portal)}`} icon={<KeyRound size={16} />}
          onClick={() => setOpen('key')} />
      </Group>
    )}
    <Group><ButtonRow label="Forget saved logins" tone="bad" onClick={forget} /></Group>
  </>

  const server = <>
    <Group title="Server">
      <EntryRow label="Login host" value={d.host} onChange={(h) => up({ host: h })} placeholder="login.example.edu" />
      <ActionRow label="SSH port">
        <NumberBox label="SSH port" value={d.port ?? 22} onChange={(port) => up({ port })} min={1} max={65535}
          width={72} />
      </ActionRow>
    </Group>
    <Group title="VPN" description="Web sign-in (SSO) opens in a window of HPC Hub's own, never your browser.">
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
          <EntryRow label={saved?.vpn.password ? 'VPN password (saved, leave empty to keep)'
            : 'VPN password (empty = cluster password)'} value={vpnPassword} onChange={setVpnPassword} password />
        </>}
      </Group>
    )}
  </>

  const compute = <>
    <Group title="Compute node" description="Requested with salloc after you connect. Agents run here.">
      <SwitchRow label="Request node on connect" checked={d.request_node_on_connect ?? true}
        onChange={(request_node_on_connect) => up({ request_node_on_connect })} />
      {(d.request_node_on_connect ?? true) && (
        <SwitchRow label="Ask every time" sub="Show the node's settings before each request"
          checked={d.ask_node ?? false} onChange={(ask_node) => up({ ask_node })} />
      )}
      <SwitchRow label="Use my running job" checked={d.reuse_running_job ?? false}
        sub="If you already have a node (for an agent, say), use it instead of a new one"
        onChange={(reuse_running_job) => up({ reuse_running_job })} />
      <ProfileRows cluster={d.id} p={d.profile} onChange={(profile) => up({ profile })}
        extra="Extra salloc arguments" />
    </Group>
    <Group title="Queues"
      description="Queues to choose from, cheapest first. The first that starts in time wins, else the one that
        starts soonest. Empty: always the partition and QOS above.">
      <EntryRow label="Queues (partition:qos, comma separated)" value={d.queues ?? ''}
        onChange={(queues) => up({ queues })} placeholder="general:low,general:standard" />
      <SpinRow label="Wait for a cheaper queue (seconds)" value={d.queue_wait ?? 60}
        onChange={(queue_wait) => up({ queue_wait })} min={0} max={3600} />
    </Group>
  </>

  const vs = d.vscode
  const vscode = vs && <>
    <Group title="VS Code job"
      description="The VS Code button submits this as its own batch job (sbatch) and shows its log. If a VS Code job
        is already running, it opens that one instead.">
      <EntryRow label="Run first (for example module load VSCode)" value={vs.setup} onChange={(setup) => upVs({ setup })} />
      <EntryRow label="Command" value={vs.command} onChange={(command) => upVs({ command })} />
      <EntryRow label="Start in folder" value={vs.workdir} onChange={(workdir) => upVs({ workdir })} placeholder="~" />
      <ComboRow label="Open in" value={vs.open_in} options={TARGETS}
        onChange={(x) => upVs({ open_in: x as VsCode['open_in'] })} />
      <SwitchRow label="Open automatically" sub="When the tunnel is ready, and the GitHub sign-in page"
        checked={vs.open_links} onChange={(open_links) => upVs({ open_links })} />
    </Group>
    <Group title="Job resources">
      <ProfileRows cluster={d.id} p={vs.compute} onChange={(c) => upVs({ compute: c })} extra="Extra sbatch arguments" />
    </Group>
  </>

  const agents = <>
    <p className="mb-4 text-[13px] text-dim">What each agent starts with on {d.name}. You can change these when you
      start one too.</p>
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
            sub="Off: the node you have (requested if needed)" onChange={(new_node) => upAgent(a.id, { new_node })} />
          {a.remote_label && <SwitchRow label={a.remote_label} sub={a.remote_hint} checked={s.remote}
            onChange={(remote) => upAgent(a.id, { remote })} />}
          <EntryRow label="Start in folder" value={s.workdir} onChange={(workdir) => upAgent(a.id, { workdir })}
            placeholder="~" />
        </Group>
      )
    })}
  </>

  const pages: Record<Tab, React.ReactNode> = { login, server, compute, vscode, agents }
  return (
    <>
      <Dialog title={`${d.name} settings`} onClose={onClose} width={640}
        actions={<>
          <Button onClick={onClose}>Cancel</Button>
          <Button kind="suggested" disabled={busy || !saved || !info} onClick={save}>Save</Button>
        </>}>
        <div role="tablist" className="mb-4 flex flex-wrap justify-center gap-1 rounded-full bg-pill p-1">
          {TABS.filter(([t]) => t !== 'vscode' || vs).map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`h-8 flex-1 whitespace-nowrap rounded-full px-3 text-[14px] font-bold transition ${
                tab === t ? 'bg-card shadow-[var(--shadow-card)]' : 'text-dim hover:text-[var(--color-text)]'}`}>
              {label}</button>
          ))}
        </div>
        {hint && <p className="mb-4 rounded-lg bg-warn-bg px-4 py-2.5 text-[14px] font-bold text-warn">{hint}</p>}
        {error && <p role="alert" className="mb-4 rounded-lg bg-bad-bg px-4 py-2.5 text-[14px] font-bold text-bad">
          {error}</p>}
        {pages[tab]}
      </Dialog>
      {open === 'help' && <AuthenticatorHelp cluster={d} onClose={() => setOpen(null)} />}
      {open === 'key' && <KeySetupDialog cluster={d} onClose={() => setOpen(null)} onDone={keyDone} />}
    </>
  )
}
