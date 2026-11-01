// A cluster's settings, like the GTK app's settings.py, in two tabs: Sign-in (username, password or key; the
// server and VPN under Advanced) and Compute (the node; queues, the VS Code job and the agents under Advanced).
// Saved with cluster_settings.save, which checks every field; logins with clusters.set_login. Passwords go in
// and never come back out.
import { ChevronRight, ExternalLink, KeyRound, Lock } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import { secondStep, type AgentId, type AgentSettings, type Cluster, type Limits, type Logins, type Profile,
  type SettingsInfo, type VsCode } from '../../types/clusters'
import { openSystem } from '../app/openLink'
import { keyStore } from '../app/platform'
import { useToast } from '../toast'
import { Button, Dialog, List } from '../ui'
import { Duration } from './ComputeDialog'
import { ActionRow, ComboRow, EntryRow, Group, NumberBox, SpinRow, SwitchRow } from './fields'
import { KeyPanel, keyHeading, PasswordInstead } from './KeyPanel'
import { KeySetupDialog } from './KeySetupDialog'
import { copy } from './loginCopy'
import { CHROME_WINDOW } from './SignIn'
import { putCluster } from './store'
import { minutes, slurmTime } from './time'

const TABS = [['login', 'Sign-in'], ['compute', 'Compute']] as const
export type Tab = typeof TABS[number][0]
/** The tabs before there were two (a demo link or an old caller): where their settings live now. */
const MOVED: Record<string, [Tab, boolean]> = { server: ['login', true], vscode: ['compute', true],
  agents: ['compute', true] }

/** A closed section at the bottom of a tab, for settings most people never change. */
function Advanced({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div className="mt-2 border-t border-line pt-3">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="-ml-1 flex items-center gap-1.5 rounded-md px-1 py-1 text-[15px] font-bold hover:bg-hover">
        <ChevronRight size={16} className={`transition ${open ? 'rotate-90' : ''}`} />Advanced</button>
      {open && <div className="mt-4">{children}</div>}
    </div>
  )
}

const TARGETS: [string, string][] = [['desktop', 'VS Code app'], ['browser', 'Browser (vscode.dev)']]
const PROFILE_KEYS = ['cpus', 'mem_gb', 'time', 'partition', 'account', 'qos', 'gpus', 'extra_args'] as const
const VPN_KEYS = ['enabled', 'gateway', 'protocol', 'useragent', 'authgroup', 'same_login_as_ssh', 'split_tunnel',
  'domains', 'routes', 'browser'] as const

const pick = <T extends object, K extends keyof T>(o: T, keys: readonly K[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))


/** Cores, memory, GPUs, time, partition, account, QOS and extra arguments (settings.py ProfileRows). */
function ProfileRows({ cluster, p, onChange, extra, rows = 'all' }:
  { cluster: string; p: Profile; onChange: (p: Profile) => void; extra: string; rows?: 'all' | 'size' | 'more' }) {
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
    {rows !== 'more' && <>
      <SpinRow label="CPU cores" value={p.cpus} onChange={(cpus) => set({ cpus })} min={1} max={512} />
      <SpinRow label="Memory (GB)" value={p.mem_gb} onChange={(mem_gb) => set({ mem_gb })} min={1} max={4096} />
      <Duration total={minutes(p.time) ?? 240} onChange={(m) => set({ time: slurmTime(m) })} limits={limits} />
      <SpinRow label="GPUs" value={p.gpus ?? 0} onChange={(gpus) => set({ gpus })} min={0} max={16} />
      <EntryRow label="Partition" value={p.partition} onChange={(partition) => set({ partition })}
        list={limits?.partitions} placeholder={limits?.default_partition} />
    </>}
    {rows !== 'size' && <More p={p} set={set} limits={limits} extra={extra} />}
  </>
}

function More({ p, set, limits, extra }:
  { p: Profile; set: (c: Partial<Profile>) => void; limits: Limits | null; extra: string }) {
  return <>
    <EntryRow label="Account" value={p.account ?? ''} onChange={(account) => set({ account })} />
    <EntryRow label="QOS" value={p.qos ?? ''} onChange={(qos) => set({ qos })} list={limits?.qos}
      placeholder={limits?.default_qos} />
    <EntryRow label={extra} value={p.extra_args ?? ''} onChange={(extra_args) => set({ extra_args })}
      placeholder="--constraint=gpu" />
  </>
}

export function SettingsDialog({ cluster, hint, onClose, start = 'login', advanced = false }:
  { cluster: Cluster; hint?: string; onClose: () => void; start?: string; advanced?: boolean }) {
  const toast = useToast()
  const [first, firstOpen] = MOVED[start] ?? [start === 'compute' ? 'compute' : 'login', advanced]
  const [tab, setTab] = useState<Tab>(first)
  const [more, setMore] = useState(firstOpen)
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
  const signIn: [string, string][] = [['', 'Built-in window'],
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
  const forgetLink = (what: string) => (
    <button type="button" onClick={forget}
      className="rounded px-1 py-1 text-[14px] text-bad hover:underline">Forget {what}</button>
  )
  const keyText = keyHeading(d).text
  const login = d.key_page && !usePassword ? <>
    {keyText && <p className="mb-3 text-[14px] text-dim">{keyText}</p>}
    <div className="mb-3"><KeyPanel cluster={d} user={user} onUser={setUser} /></div>
    {instead}
    <div className="mb-4 flex">{forgetLink(d.username_label || 'username')}</div>
  </> : <>
    <List>
      <EntryRow label={d.username_label || 'Username'} value={user} onChange={setUser} autoFocus
        placeholder={copy.usernameHint} />
      <EntryRow label={copy.password} value={password} onChange={setPassword} password
        placeholder={!remember ? 'Asked when you connect' : saved?.ssh.password ? copy.saved : undefined} />
      <SwitchRow label={copy.remember} checked={remember} onChange={setRemember}
        sub={remember ? undefined : copy.rememberOff} />
    </List>
    <div className="mb-5 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[13px] text-dim">
      {remember && <span className="flex items-center gap-1.5"><Lock size={13} />{copy.savedIn(keyStore)}</span>}
      <span>{secondStep(d)}</span>
      {code && d.code_setup && <button type="button" onClick={() => openSystem(d.code_setup!)}
        className="inline-flex items-center gap-1 font-bold text-accent-text hover:underline">
        {copy.codeSetup}<ExternalLink size={12} /></button>}
    </div>
    {instead}
    {d.portal && (
      <div className="mb-5 flex items-center gap-4 rounded-xl bg-card px-4 py-3 shadow-[var(--shadow-card)]">
        <KeyRound size={18} className="shrink-0 text-accent-text" />
        <p className="min-w-0 flex-1 text-[14px]">Skip the password: add this computer's SSH key through the portal.
          <span className="text-dim"> You'll still need the code.</span></p>
        <Button type="button" onClick={() => setOpen('key')}>{copy.portal(d)}</Button>
      </div>
    )}
    <div className="mb-4 flex">{forgetLink('saved password')}</div>
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
    <Group description="Your terminals and agents run on a compute node, not the busy login node.">
      <SwitchRow label="Get a compute node when I connect" checked={d.request_node_on_connect ?? true}
        onChange={(request_node_on_connect) => up({ request_node_on_connect })} />
      {(d.request_node_on_connect ?? true) && (
        <SwitchRow label="Review these before each request" checked={d.ask_node ?? false}
          onChange={(ask_node) => up({ ask_node })} />
      )}
      <SwitchRow label="Reuse a node you already have" checked={d.reuse_running_job ?? false}
        onChange={(reuse_running_job) => up({ reuse_running_job })} />
    </Group>
    <Group title="Node size">
      <ProfileRows cluster={d.id} p={d.profile} onChange={(profile) => up({ profile })} rows="size"
        extra="Extra salloc arguments" />
    </Group>
  </>

  const queues = <>
    <Group title="Slurm">
      <ProfileRows cluster={d.id} p={d.profile} onChange={(profile) => up({ profile })} rows="more"
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
    <h3 className="mb-1 text-[15px] font-bold">Agents</h3>
    <p className="mb-3 text-[13px] text-dim">What each agent starts with. You can change these when you start one
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
            sub="Off: the node you have (requested if needed)" onChange={(new_node) => upAgent(a.id, { new_node })} />
          {a.remote_label && <SwitchRow label={a.remote_label} sub={a.remote_hint} checked={s.remote}
            onChange={(remote) => upAgent(a.id, { remote })} />}
          <EntryRow label="Start in folder" value={s.workdir} onChange={(workdir) => upAgent(a.id, { workdir })}
            placeholder="~" />
        </Group>
      )
    })}
  </>

  const pages: Record<Tab, ReactNode> = {
    login: <>{login}<Advanced open={more} onToggle={() => setMore(!more)}>{server}</Advanced></>,
    compute: <>{compute}<Advanced open={more} onToggle={() => setMore(!more)}>
      {queues}{vscode}{agents}</Advanced></>,
  }
  return (
    <>
      <Dialog title={`${d.name} settings`} onClose={onClose} width={640}
        actions={<>
          <Button onClick={onClose}>Cancel</Button>
          <Button kind="suggested" disabled={busy || !saved || !info} onClick={save}>Save</Button>
        </>}>
        <div role="tablist" className="mb-4 flex flex-wrap justify-center gap-1 rounded-full bg-pill p-1">
          {TABS.map(([t, label]) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setMore(false) }}
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
      {open === 'key' && <KeySetupDialog cluster={d} onClose={() => setOpen(null)} onDone={keyDone} />}
    </>
  )
}
