// Shapes the Clusters page gets from the backend (see hpc_hub/core/config.py and hpc_hub/api/methods/clusters.py).
import { S } from '../components/clusters/loginStrings'

export type Profile = {
  cpus: number
  mem_gb: number
  time: string
  partition: string
  account?: string
  qos?: string
  gpus?: number
  gpu_type?: string  // Slurm's gres type (a100_10g, h100); '' = any GPU
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
  ask?: boolean  // show the VS Code window before it starts
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
  org?: string  // who runs it: "NJIT"
  short?: string  // "Yale" for "Yale Bouchet" (config.py short); loginCopy shortName falls back to the name
  key_page?: string  // a page where you paste your public SSH key (Yale)
  key_page_note?: string
  key_help?: string  // a guide to SSH keys for it ("" = GitHub's)
  username_label?: string  // what it calls your username: UCID, NetID
  password_only?: boolean  // its SSH server takes no keys
  password_too?: boolean  // with key_page: a password works as well
  code_setup?: string
  queues?: string
  fast?: string  // "partition:qos:time" of the Fast node queue
  queue_wait?: number
  request_node_on_connect?: boolean
  ask_node?: boolean  // with request_node_on_connect: show the node's settings first
  reuse_running_job?: boolean
  vpn: Vpn
  profile: Profile
  vscode?: VsCode
} & Partial<Record<AgentId, AgentSettings>>

/** What the settings dialog needs besides the cluster (cluster_settings.get). */
export type SettingsInfo = {
  cluster: Cluster
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
  pick_node?: boolean  // connected, waiting for you to pick a node (ask_node)
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
  accounts?: string[]  // the groups you may bill (Slurm accounts)
  default_account?: string
  longest: number | null
  why: string
  cores?: number | null      // the biggest node on this queue: the most one job can ask for
  memory_gb?: number | null
}

/** A question a login asks (hpc_hub/api/hub.py). chrome-window: signing in in our Chrome window (answer
 * "in-app" or null). web-login: the app's sign-in window (app/src-tauri/src/sso.rs), answered with JSON
 * {token, error}. Never your own Chrome profile. */
export type Question = {
  id: string
  kind: 'ask' | 'code' | 'chrome-window' | 'web-login' | 'confirm'
  cluster: string
  name: string
  title?: string  // confirm: answered "yes", or null for no; a sign-in that isn't the VPN's (a portal)
  prompt?: string
  default?: string
  note?: string  // web-login: what to say under the waiting dialog, instead of the VPN's words
  login_url?: string
  final_url?: string
  token_cookie?: string
  error_cookie?: string
  fill?: { socket: string; token: string } | null
}

export const BUSY: State[] = ['Connecting VPN', 'Signing in', 'Approve Duo on your phone', 'Requesting compute node',
  'Disconnecting']
export const DUO: State = 'Approve Duo on your phone'

/** The cluster's second step, decided by its admins, said under its name (login_copy.py SECOND_*). */
export function secondStep(c: Pick<Cluster, 'second_factor'>) {
  return c.second_factor === 'code' ? S.SECOND_CODE : S.SECOND_DUO
}

/** This computer's SSH key (keys.mine). */
export type MyKey = { path: string; file: string; kind: string; public: string; made: number; made_on: string }
/** A login test with only the key (keys.test). kind "wait": the cluster doesn't know the key yet. */
export type KeyTest = {
  ok: boolean; text: string; kind: 'ok' | 'wait' | 'error'
  reason?: 'ok' | 'not_yet' | 'no_vpn' | 'unreachable' | 'host_key' | 'unfinished' | 'no_ssh'; last?: string
}

/** "4 h", "30 min", "1 d 12 h" for Slurm's "04:00:00", "00:30:00", "1-12:00:00". */
export function shortTime(t: string) {
  const [d, hms] = t.includes('-') ? t.split('-') : ['0', t]
  const [h = 0, m = 0] = hms.split(':').map((x) => Number(x) || 0)
  const parts = [Number(d) ? `${Number(d)} d` : '', h ? `${h} h` : '', m ? `${m} min` : '']
  return parts.filter(Boolean).join(' ') || t
}

/** "A100 10 GB slice", "2 × H100", "GPU", or '' without one (the full names come from components/clusters/gpus.ts). */
export function gpuText(p: Profile) {
  if (!p.gpus) return ''
  const name = (p.gpu_type || 'GPU').replace(/_(\d+)g$/, ' $1 GB slice').replace(/_/g, ' ').toUpperCase()
    .replace(' GB SLICE', ' GB slice')
  return p.gpus > 1 ? `${p.gpus} × ${name}` : name
}

/** "1 core", "4 cores". */
export const cores = (n: number | string) => `${n} core${Number(n) === 1 ? '' : 's'}`

/** "4 cores · 16 GB · 4 h · A100": the size, without the queue (hpc_hub/core/config.py summary). */
export function summary(p: Profile) {
  return [cores(p.cpus), `${p.mem_gb} GB`, shortTime(p.time), gpuText(p)].filter(Boolean).join(' · ')
}
