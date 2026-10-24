// Demo data for the Clusters page. Actions change this state over a few seconds, the page polls it.
import {
  summary, type Cluster, type Limits, type Logins, type Profile, type Session, type State,
} from '../types/clusters'

type Step = [number, Partial<Session> & { state: State }, string?]
const summaryOf = (c: Cluster) => summary(c.profile)

const profile: Profile = { cpus: 4, mem_gb: 16, time: '04:00:00', partition: 'general', account: '', qos: '', gpus: 0 }
const clusters: Cluster[] = [
  { id: 'wulver', name: 'Wulver (NJIT)', host: 'wulver.njit.edu', second_factor: 'duo', request_node_on_connect: true,
    vpn: { enabled: true, gateway: 'vpn.njit.edu', same_login_as_ssh: true }, profile },
  { id: 'yale', name: 'Yale Bouchet', host: 'bouchet.ycrc.yale.edu', second_factor: 'duo',
    request_node_on_connect: true, vpn: { enabled: true, gateway: 'access.yale.edu', same_login_as_ssh: false },
    profile: { ...profile, cpus: 2, partition: 'day' } },
  { id: 'sdsc', name: 'SDSC Expanse', host: 'login.expanse.sdsc.edu', second_factor: 'code',
    code_setup: 'https://passive.sdsc.edu', request_node_on_connect: true, vpn: { enabled: false, gateway: '' },
    profile: { ...profile, cpus: 2, partition: 'shared' } },
]

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
}
