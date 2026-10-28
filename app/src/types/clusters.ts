// Shapes the Clusters page gets from the backend (see hpc_hub/core/config.py and hpc_hub/api/methods/clusters.py).
export type Profile = {
  cpus: number
  mem_gb: number
  time: string
  partition: string
  account?: string
  qos?: string
  gpus?: number
  extra_args?: string
}

export type Vpn = {
  enabled: boolean
  gateway: string
  same_login_as_ssh?: boolean
  protocol?: string
  useragent?: string
  authgroup?: string
  split_tunnel?: boolean
  domains?: string
  routes?: string
  browser?: string
}

export type VsCode = {
  command: string
  setup: string
  workdir: string
  open_links: boolean
  open_in: 'desktop' | 'browser'
  compute: Profile
}

export type AgentId = 'claude' | 'codex' | 'agy' | 'cursor'

/** One agent's saved choices (config.py AgentSettings); "" = the agent's default. */
export type AgentSettings = {
  command: string
  workdir: string
  new_node: boolean
  remote: boolean
  model: string
  mode: string
  effort: string
  sandbox: string
  approval: string
}

export type Cluster = {
  id: string
  name: string
  host: string
  port?: number
  duo_answer?: string
  second_factor?: 'duo' | 'code'
  portal?: string
  code_setup?: string
  queues?: string
  fast?: string  // "partition:qos:time" of the Fast node queue
  queue_wait?: number
  request_node_on_connect?: boolean
  reuse_running_job?: boolean
  vpn: Vpn
  profile: Profile
  vscode?: VsCode
} & Partial<Record<AgentId, AgentSettings>>

/** What the settings dialog needs besides the cluster (cluster_settings.get). */
export type SettingsInfo = {
  cluster: Cluster
  browsers: string[]
  chrome_window: { value: string; offered: boolean }  // our own Chrome window's vpn.browser value
  protocols: string[]
  agents: { id: AgentId; name: string; remote_label: string; remote_hint: string
    options: { key: keyof AgentSettings; label: string; choices: [string, string][] }[] }[]
}

/** The portal key setup (keysetup.status). */
export type KeySetup = {
  state: 'waiting' | 'working' | 'done' | 'failed' | 'stopped'
  title: string
  text: string
  user: string
}

export type State = 'Disconnected' | 'Connecting VPN' | 'Signing in' | 'Approve Duo on your phone' |
  'Requesting compute node' | 'Connected' | 'Disconnecting' | 'Error'

export type Session = {
  id: string
  state: State
  connected?: boolean
  detail?: string
  node?: string
  job?: string
  owned?: boolean
}

/** Saved usernames; password only says whether one is saved, it never comes back. */
export type Logins = Record<'ssh' | 'vpn', { username: string; password: boolean }> & { remember?: boolean }

/** What Slurm allows (clusters.partitions); longest in minutes, null = no limit. */
export type Limits = {
  known: boolean
  partitions: string[]
  default_partition: string
  qos: string[]
  default_qos: string
  longest: number | null
  why: string
}

export type ChromeProfile = { name: string; email: string }

/** A question a login asks (hpc_hub/api/hub.py). pick-browser: where to sign in to the VPN (answer "" for the
 * app's window, chrome_window for our Chrome window, or a profile name). browser-login: signing in in Chrome
 * (answer "again", "in-app" or null). chrome-window: signing in in our Chrome window (answer "in-app" or null).
 * web-login: the app's sign-in window (app/src-tauri/src/sso.rs), answered with JSON {token, error}. */
export type Question = {
  id: string
  kind: 'ask' | 'code' | 'pick-browser' | 'browser-login' | 'chrome-window' | 'web-login' | 'confirm'
  cluster: string
  name: string
  title?: string  // confirm: answered "yes", or null for no
  prompt?: string
  default?: string
  profiles?: ChromeProfile[]
  chrome_window?: string  // pick-browser: offered when set
  profile?: string
  login_url?: string
  final_url?: string
  token_cookie?: string
  error_cookie?: string
  fill?: { socket: string; token: string } | null
}

export const BUSY: State[] = ['Connecting VPN', 'Signing in', 'Approve Duo on your phone', 'Requesting compute node',
  'Disconnecting']
export const DUO: State = 'Approve Duo on your phone'

export function summary(p: Profile) {
  return [`${p.cpus} cores`, `${p.mem_gb} GB`, p.time, p.gpus ? `${p.gpus} GPU` : '', p.partition]
    .filter(Boolean).join(' · ')
}

/** Your node settings on the Fast node queue (hpc_hub/core/config.py fast_profile); null without one. */
export function fastProfile(c: Cluster): Profile | null {
  const [part = '', qos = '', ...rest] = (c.fast ?? '').split(':')
  if (!part.trim()) return null
  return { ...c.profile, partition: part.trim(), qos: qos.trim(), time: rest.join(':').trim() || c.profile.time }
}

/** 'Fast node (30 min)', 'Fast node (8 h)'; '' without a fast queue. */
export function fastLabel(c: Cluster): string {
  const p = fastProfile(c)
  if (!p) return ''
  const [d, hms] = p.time.includes('-') ? p.time.split('-') : ['0', p.time]
  const [h = 0, m = 0] = hms.split(':').map((x) => Number(x) || 0)
  const minutes = Number(d) * 1440 + h * 60 + m
  return minutes < 60 ? `Fast node (${minutes} min)` : `Fast node (${+(minutes / 60).toFixed(2)} h)`
}

export const fastSummary = (c: Cluster) => { const p = fastProfile(c); return p ? summary(p) : '' }
