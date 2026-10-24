// Shapes the Clusters page gets from the backend (see hpc_hub/core/config.py and hpc_hub/api/methods/clusters.py).
export type Profile = {
  cpus: number
  mem_gb: number
  time: string
  partition: string
  account?: string
  qos?: string
  gpus?: number
}

export type Cluster = {
  id: string
  name: string
  host: string
  second_factor?: 'duo' | 'code'
  code_setup?: string
  request_node_on_connect?: boolean
  vpn: { enabled: boolean; gateway: string; same_login_as_ssh?: boolean }
  profile: Profile
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
export type Logins = Record<'ssh' | 'vpn', { username: string; password: boolean }>

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
 * app's window or a profile name). browser-login: signing in in Chrome (answer "again", "in-app" or null).
 * web-login: the app's sign-in window (app/src-tauri/src/sso.rs), answered with JSON {token, error}. */
export type Question = {
  id: string
  kind: 'ask' | 'code' | 'pick-browser' | 'browser-login' | 'web-login'
  cluster: string
  name: string
  prompt?: string
  default?: string
  profiles?: ChromeProfile[]
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
