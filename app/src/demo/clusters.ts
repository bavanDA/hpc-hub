// Demo data for the Clusters page. Actions change this state over a few seconds, the page polls it.
import {
  summary, type AgentSettings, type Cluster, type KeySetup, type Limits, type Logins, type Profile, type Session,
  type SettingsInfo, type State, type VsCode,
} from '../types/clusters'

type Step = [number, Partial<Session> & { state: State }, string?]
const summaryOf = (c: Cluster) => summary(c.profile)

const profile: Profile = { cpus: 4, mem_gb: 16, time: '04:00:00', partition: 'general', account: '', qos: '', gpus: 0,
  extra_args: '' }
const vpn = { protocol: 'anyconnect', useragent: 'AnyConnect Linux_64 4.10.07061', authgroup: '', split_tunnel: true,
  domains: '', routes: '', browser: '' }
const vscode = (compute: Partial<Profile>): VsCode => ({ command: 'code tunnel --accept-server-license-terms',
  setup: 'module load VSCode', workdir: '~', open_links: true, open_in: 'desktop',
  compute: { ...profile, cpus: 2, mem_gb: 8, time: '08:00:00', ...compute } })
const agent = (command: string): AgentSettings => ({ command, workdir: '~', new_node: false, remote: false,
  model: '', mode: '', effort: '', sandbox: '', approval: '' })
const agents = { claude: { ...agent('claude'), model: 'opus', remote: true }, codex: agent('codex'),
  agy: agent('agy'), cursor: agent('cursor-agent') }
const clusters: Cluster[] = [
  { id: 'wulver', name: 'Wulver (NJIT)', org: 'NJIT', username_label: 'UCID', password_only: true, host: 'wulver.njit.edu', port: 22,
    duo_answer: 'push', second_factor: 'duo',
    queues: 'general:low,debug:debug,general:standard', queue_wait: 60, fast: 'debug:debug:08:00:00',
    request_node_on_connect: true,
    reuse_running_job: false, vpn: { ...vpn, enabled: true, gateway: 'vpn.njit.edu', same_login_as_ssh: true,
      domains: 'njit.edu', routes: '128.235.0.0/16' }, profile,
    vscode: vscode({ cpus: 16, mem_gb: 64, time: '12:00:00', qos: 'standard' }), ...agents },
  { id: 'yale', name: 'Yale Bouchet', org: 'Yale', host: 'bouchet.ycrc.yale.edu', port: 22, duo_answer: 'push',
    username_label: 'NetID', key_page: 'https://sshkeys.ycrc.yale.edu/',
    key_page_note: "The page opens only on Yale's network or the Yale VPN. Your key can take up to 10 minutes to start working.",
    key_help: 'https://docs.ycrc.yale.edu/clusters-at-yale/access/ssh/',
    second_factor: 'duo', queues: '', queue_wait: 60, request_node_on_connect: true, reuse_running_job: true,
    vpn: { ...vpn, enabled: true, gateway: 'access.yale.edu', same_login_as_ssh: false, authgroup: 'Default',
      domains: 'yale.edu', routes: '130.132.0.0/16 128.36.0.0/16', browser: 'Uni' },
    profile: { ...profile, cpus: 2, partition: 'day' }, vscode: vscode({ partition: 'devel' }), ...agents },
  { id: 'sdsc', name: 'SDSC Expanse', org: 'SDSC', username_label: 'ACCESS username', host: 'login.expanse.sdsc.edu', port: 22, duo_answer: 'push',
    second_factor: 'code', portal: 'https://portal.expanse.sdsc.edu', code_setup: 'https://passive.sdsc.edu',
    queues: '', queue_wait: 60, request_node_on_connect: true, reuse_running_job: false,
    vpn: { ...vpn, enabled: false, gateway: '', same_login_as_ssh: true },
    profile: { ...profile, cpus: 2, partition: 'shared' }, vscode: vscode({ partition: 'shared' }), ...agents },
]

const DEFAULT: [string, string] = ['', 'Default']
const EFFORT: [string, string][] = [DEFAULT, ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'],
  ['xhigh', 'Extra high'], ['max', 'Max']]
const agentInfo: SettingsInfo['agents'] = [
  { id: 'claude', name: 'Claude', remote_label: 'Remote control',
    remote_hint: 'Use this session from claude.ai/code or the Claude app', options: [
      { key: 'model', label: 'Model', choices: [DEFAULT, ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']] },
      { key: 'mode', label: 'Permission mode', choices: [DEFAULT, ['acceptEdits', 'Accept edits'], ['plan', 'Plan only'],
        ['auto', 'Auto'], ['dontAsk', "Don't ask"]] },
      { key: 'effort', label: 'Effort', choices: EFFORT }] },
  { id: 'codex', name: 'ChatGPT', remote_label: 'ChatGPT remote',
    remote_hint: 'Use it from the ChatGPT app. One at a time: this stops the previous one', options: [
      { key: 'sandbox', label: 'Sandbox', choices: [DEFAULT, ['read-only', 'Read only'],
        ['workspace-write', 'Write in the folder']] },
      { key: 'approval', label: 'Ask before running commands', choices: [DEFAULT,
        ['on-request', 'When it thinks it should'], ['never', 'Never']] },
      { key: 'effort', label: 'Reasoning effort', choices: EFFORT.slice(0, 5) }] },
  { id: 'agy', name: 'Antigravity', remote_label: 'Remote control',
    remote_hint: 'Use this session from Antigravity on another device', options: [
      { key: 'mode', label: 'Mode', choices: [DEFAULT, ['accept-edits', 'Accept edits'], ['auto', 'Auto'],
        ['plan', 'Plan only']] },
      { key: 'effort', label: 'Effort', choices: EFFORT },
      { key: 'sandbox', label: 'Sandbox the terminal', choices: [['', 'Off'], ['on', 'On']] }] },
  { id: 'cursor', name: 'Cursor', remote_label: '', remote_hint: '', options: [
    { key: 'model', label: 'Model', choices: [DEFAULT, ['auto', 'Auto'], ['composer-2.5', 'Composer 2.5']] },
    { key: 'mode', label: 'Mode', choices: [DEFAULT, ['plan', 'Plan only'], ['ask', 'Ask (read only)']] },
    { key: 'sandbox', label: 'Sandbox', choices: [DEFAULT, ['enabled', 'On'], ['disabled', 'Off']] }] },
]

// the portal key setup walks from waiting to done a few seconds after it starts
let keySince = 0
function keyStatus(): KeySetup {
  const t = Date.now() - keySince
  if (!keySince) return { state: 'stopped', title: '', text: '', user: '' }
  if (t < 6000) return { state: 'waiting', title: 'Sign in to the portal',
    text: 'Sign in in the window that opened. The app does the rest by itself.', user: '' }
  if (t < 8000) return { state: 'working', title: 'Signed in as jdoe',
    text: "Adding this computer's key to your account…", user: 'jdoe' }
  return { state: 'done', title: 'Signed in as jdoe', text: 'Key added. Connecting…', user: 'jdoe' }
}

const sessions: Session[] = [
  { id: 'wulver', state: 'Connected', connected: true, node: 'n0042', job: '123456', owned: true },
  { id: 'yale', state: 'Connected', connected: true },
  { id: 'sdsc', state: 'Disconnected', connected: false },
]

const logs: Record<string, string[]> = {
  wulver: ['09:14:02  VPN vpn.njit.edu is up', '09:14:05  Signing in as jdoe', '09:14:11  Duo approved',
    '09:14:12  Requesting 4 cores · 16 GB · 04:00:00 · general', '09:14:31  Node n0042 (job 123456)'],
  yale: ['09:20:40  VPN access.yale.edu is up', '09:20:44  Signing in as jdoe', '09:20:52  Duo approved'],
  sdsc: [],
}

const limits = {
  partitions: { general: 4320, debug: 480, gpu: 2880, shared: 2880, day: 1440 } as Record<string, number>,
  qos: { low: 1440, standard: 4320 } as Record<string, number> }

function find<T extends { id: string }>(list: T[], id: string) {
  return list.find((x) => x.id === id)!
}

function log(id: string, line: string) {
  const t = new Date().toLocaleTimeString('en-GB', { hour12: false })
  logs[id] = [...logs[id], `${t}  ${line}`].slice(-1000)
}

/** Walk a session through states, one step after another. */
function steps(id: string, list: Step[]) {
  let wait = 0
  for (const [ms, change, line] of list) {
    wait += ms
    setTimeout(() => {
      const s = find(sessions, id)
      Object.assign(s, { detail: '' }, change)
      if (line) log(id, line)
    }, wait)
  }
}

function connect({ cluster, vpn_only }: { cluster: string; vpn_only?: boolean }) {
  const c = find(clusters, cluster)
  const node = c.request_node_on_connect && !vpn_only
  const job = String(123500 + Math.floor(Math.random() * 400))
  const plan: Step[] = []
  if (c.vpn.enabled) plan.push([0, { state: 'Connecting VPN', detail: c.vpn.gateway }, `Starting VPN ${c.vpn.gateway}`])
  if (vpn_only) {
    plan.push([1500, { state: 'Connected', connected: false, detail: 'VPN only' }, 'VPN is up'])
  } else {
    plan.push([c.vpn.enabled ? 1200 : 0, { state: 'Signing in', detail: 'Signing in as jdoe' }, 'Signing in as jdoe'])
    plan.push(c.second_factor === 'code'
      ? [1500, { state: 'Signing in', detail: 'Code accepted' }, 'Code accepted']
      : [1200, { state: 'Approve Duo on your phone', detail: 'Duo push sent to your phone' }, 'Duo push sent'])
    plan.push([3500, node ? { state: 'Requesting compute node', detail: summaryOf(c) }
      : { state: 'Connected', connected: true }, 'Signed in'])
    if (node) plan.push([2000, { state: 'Connected', connected: true, node: 'n0107', job, owned: true },
      `Node n0107 (job ${job})`])
  }
  steps(cluster, plan)
  return null
}

export const answers: Record<string, unknown> = {
  'app.version': { version: 'demo' },
  'clusters.list': () => clusters,
  'sessions.list': () => sessions.map((s) => ({ ...s })),
  'clusters.log': ({ cluster }: { cluster: string }) => logs[cluster] ?? [],
  'clusters.connect': connect,
  'clusters.disconnect': ({ cluster }: { cluster: string }) => {
    steps(cluster, [[0, { state: 'Disconnecting' }, 'Disconnecting'],
      [1200, { state: 'Disconnected', connected: false, node: '', job: '' }, 'Disconnected']])
    return null
  },
  'clusters.cancel': ({ cluster }: { cluster: string }) => {
    steps(cluster, [[300, { state: 'Error', connected: false, detail: 'Cancelled' }, 'Cancelled']])
    return null
  },
  'clusters.request_node': ({ cluster, profile: p, remember }:
    { cluster: string; profile?: Profile; remember?: boolean }) => {
    const c = find(clusters, cluster)
    if (p && remember) c.profile = { ...c.profile, ...p }
    steps(cluster, [[0, { state: 'Requesting compute node', connected: false, detail: 'Job 123777 waiting in queue' },
      'Requesting a node'], [2500, { state: 'Connected', connected: true, node: 'n0311', job: '123777', owned: true },
      'Node n0311 (job 123777)']])
    return null
  },
  'clusters.request_fast_node': ({ cluster }: { cluster: string }) => {
    steps(cluster, [[0, { state: 'Requesting compute node', connected: false, detail: 'Job 123778 waiting in queue' },
      'Requesting a fast node (debug)'], [1200, { state: 'Connected', connected: true, node: 'n0052', job: '123778',
      owned: true }, 'Node n0052 (job 123778)']])
    return null
  },
  'clusters.release_node': ({ cluster }: { cluster: string }) => {
    const s = find(sessions, cluster)
    log(cluster, s.owned ? `Released job ${s.job}` : `Stopped using your job ${s.job}, it keeps running`)
    Object.assign(s, { node: '', job: '', owned: false })
    return null
  },
  'clusters.update': ({ cluster, changes }: { cluster: string; changes: Partial<Cluster> }) => {
    const c = find(clusters, cluster)
    Object.assign(c, { ...changes, profile: { ...c.profile, ...changes.profile }, vpn: { ...c.vpn, ...changes.vpn } })
    return { ...c }
  },
  'clusters.login': ({ cluster }: { cluster: string }): Logins => ({
    ssh: { username: 'jdoe', password: cluster !== 'sdsc' },
    vpn: { username: cluster === 'yale' ? 'jane.doe@example.edu' : '', password: false },
    remember: true,
  }),
  'clusters.set_login': () => null,
  'clusters.forget_logins': () => null,
  'clusters.partitions': ({ partition, qos }: { partition?: string; qos?: string }): Limits => {
    const caps: [number, string][] = []
    const part = partition || 'general'
    if (limits.partitions[part]) caps.push([limits.partitions[part], `partition ${part}`])
    if (qos && limits.qos[qos]) caps.push([limits.qos[qos], `QoS ${qos}`])
    const top = caps.sort((a, b) => a[0] - b[0])[0]
    return { known: true, partitions: Object.keys(limits.partitions), default_partition: 'general',
      qos: Object.keys(limits.qos), default_qos: 'low', longest: top?.[0] ?? null, why: top?.[1] ?? '' }
  },
  'question.answer': () => null,
  'cluster_settings.get': ({ cluster }: { cluster: string }): SettingsInfo => ({
    cluster: structuredClone(find(clusters, cluster)), agents: agentInfo,
    chrome_window: { value: 'hpc-hub:chrome-window', offered: true },
    protocols: ['anyconnect', 'gp', 'nc', 'pulse', 'f5', 'fortinet', 'array'] }),
  'cluster_settings.save': ({ cluster, changes }: { cluster: string; changes: Partial<Cluster> }) => {
    const c = find(clusters, cluster)
    if (changes.vpn?.enabled && !changes.vpn.gateway) throw new Error('VPN gateway is empty')
    Object.assign(c, { ...changes, profile: { ...c.profile, ...changes.profile }, vpn: { ...c.vpn, ...changes.vpn } })
    return structuredClone(c)
  },
  'keysetup.start': () => { keySince = Date.now(); return keyStatus() },
  'keysetup.status': keyStatus,
  'keysetup.stop': () => { keySince = 0; return null },
}
