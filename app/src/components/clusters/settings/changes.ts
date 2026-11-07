import type { Cluster, SettingsInfo } from '../../../types/clusters'

export type Part = '' | 'login' | 'compute' | 'server' | 'vscode' | 'agents'

export const TITLES: Record<Exclude<Part, ''>, string> = { login: 'Sign-in', compute: 'Compute node',
  server: 'Server and VPN', vscode: 'VS Code job', agents: 'Agents' }

/** advanced: the old flag for the second half of a section (Sign-in's is Server and VPN). */
export function firstPart(start: string, advanced: boolean): Part {
  if (!(start in TITLES)) return advanced ? 'server' : ''
  if (advanced && start === 'login') return 'server'
  return start as Part
}

export const ownVpnLogin = (v: Cluster['vpn']) => v.enabled && !(v.same_login_as_ssh ?? true)

const PROFILE_KEYS = ['cpus', 'mem_gb', 'time', 'partition', 'account', 'qos', 'gpus', 'gpu_type', 'extra_args'] as const
const VPN_KEYS = ['enabled', 'gateway', 'protocol', 'useragent', 'authgroup', 'same_login_as_ssh', 'split_tunnel',
  'domains', 'routes', 'browser'] as const

const pick = <T extends object, K extends keyof T>(o: T, keys: readonly K[]) =>
  Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]))

/** What cluster_settings.save takes: only the fields this dialog edits. */
export function changes(d: Cluster, agents: SettingsInfo['agents'] = []) {
  const out: Record<string, unknown> = {
    host: d.host, port: d.port,
    request_node_on_connect: d.request_node_on_connect, ask_node: d.ask_node, reuse_running_job: d.reuse_running_job,
    vpn: pick(d.vpn, VPN_KEYS),
    profile: pick(d.profile, PROFILE_KEYS),
  }
  if (d.vscode) {
    const { setup, command, workdir, open_links, open_in, ask, compute } = d.vscode
    out.vscode = { setup, command, workdir, open_links, open_in, ask, compute: pick(compute, PROFILE_KEYS) }
  }
  for (const a of agents) {
    const s = d[a.id]
    if (s) out[a.id] = pick(s, ['new_node', 'remote', 'workdir', ...a.options.map((o) => o.key)])
  }
  return Object.fromEntries(Object.entries(out).filter(([, x]) => x !== undefined))
}
