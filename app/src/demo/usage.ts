// Demo data for the Usage page: made-up accounts, people, quotas and partitions on Wulver, Yale and SDSC.
import type { Account, Allocation, Allocations, Partition, People, Person, Storage } from '../types/usage'
import { demoConnected } from './clusters'

const ACCOUNTS: Record<string, Account[]> = {
  wulver: [
    { account: 'mygroup', quota: 300000, used: 184520, mine: 21340, period: '', rate: 0 },
    { account: 'abc123', quota: 50000, used: 46100, mine: 0, period: '', rate: 0 },
  ],
  yale: [{ account: 'pi_doe', quota: 0, used: 48210, mine: 9120, period: 'FY27', rate: 0.012 }],
  sdsc: [{ account: 'xyz789', quota: 100000, used: 62300, mine: 14100, period: '', rate: 0 }],
}

// SUs per week over the last 12 weeks (oldest first) and who used them, as usage.allocations sums them from sacct
const WEEKS: Record<string, [number[], Record<string, number>]> = {
  mygroup: [[5400, 5900, 6200, 6800, 6500, 7100, 4900, 6100, 7600, 6600, 6200, 6300],
    { asmith: 31200, jdoe: 22100, bkim: 12900, cwong: 5400, dpatel: 1000 }],
  abc123: [[1100, 1250, 1300, 1150, 1400, 1200, 1350, 1500, 1250, 1450, 1500, 1460],
    { cwong: 10300, asmith: 6300 }],
  pi_doe: [[1700, 1850, 1900, 1800, 1950, 1700, 1760, 1830, 2100, 1950, 1680, 1900],
    { mlee: 9800, tross: 8200, jdoe: 4100 }],
  xyz789: [[620, 580, 840, 600, 710, 920, 640, 780, 880, 610, 700, 640], { jdoe: 5100, asmith: 3800 }],
}

/** The pace as usage.allocations works it out (no period end is known in the demo). */
function allocation(a: Account): Allocation {
  const noWeeks = typeof location !== 'undefined' && new URLSearchParams(location.search).has('noweeks')
  const [weeks, people] = WEEKS[a.account] ?? [Array(12).fill(0), {}]
  const out: Allocation = { ...a, weeks: noWeeks ? null : weeks, people: noWeeks ? {} : people, per_day: null,
    days_left: null, runs_out: '', end: '', near: !!a.quota && a.used >= a.quota }
  if (noWeeks) return out
  out.per_day = Math.round((weeks.slice(-4).reduce((s, v) => s + v, 0) / 28) * 10) / 10
  if (a.quota && out.per_day > 0) {
    out.days_left = Math.round((Math.max(a.quota - a.used, 0) / out.per_day) * 10) / 10
    const d = new Date()
    d.setDate(d.getDate() + Math.floor(out.days_left))
    out.runs_out = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.near = a.used >= a.quota || out.days_left <= 30
  }
  return out
}

// SU charged and core hours over the last 30 days; other periods scale from it
const PEOPLE: Record<string, [string, string, number, number][]> = {
  mygroup: [['asmith', 'Alex Smith', 9120, 11400], ['jdoe', 'Jane Doe', 6210, 9800], ['bkim', 'Bo Kim', 3480, 3480],
    ['cwong', 'Chris Wong', 940, 2210], ['dpatel', 'Dev Patel', 60, 120], ['elopez', 'Eva Lopez', 0, 0],
    ['fnguyen', 'Finn Nguyen', 0, 0]],
  abc123: [['cwong', 'Chris Wong', 4210, 4210], ['asmith', 'Alex Smith', 1990, 2050], ['jdoe', 'Jane Doe', 0, 0]],
  pi_doe: [['mlee', 'Mia Lee', 21400, 21400], ['tross', 'Tom Ross', 17690, 18020], ['jdoe', 'Jane Doe', 9120, 9120]],
}

function people({ account, days }: Record<string, unknown>): People {
  const f = Math.min(Number(days), 120) / 30
  const list: Person[] = (PEOPLE[String(account)] ?? []).map(([user, name, charged, hours]) =>
    ({ user, name, charged: Math.round(charged * f * 10) / 10, hours: Math.round(hours * f * 10) / 10 }))
  return { people: list, me: 'jdoe' }
}

const STORAGE: Record<string, Storage> = {
  wulver: { raw: '', rows: [
    { label: 'mygroup project', used: 1463, quota: 2048, mine: 312,
      people: { asmith: 640.2, jdoe: 312.4, bkim: 288.9, cwong: 221.5 } },
    { label: 'mygroup scratch', used: 9310, quota: 10240, mine: 4120, purged: 30,
      people: { jdoe: 4120.0, asmith: 3011.7, cwong: 2178.3 } },
    { label: 'Home', used: 38, quota: 50, mine: 38, people: {} },
  ] },
  yale: { raw: '', rows: [
    { label: 'Home', used: 61, quota: 125, mine: 61, people: {} },
    { label: 'mygroup project', used: 2210, quota: 5120, mine: 640, people: {} },
    { label: 'mygroup scratch', used: 4800, quota: 10240, mine: 1210, people: {}, purged: 30 },
  ] },
  sdsc: { raw: '', rows: [
    { label: 'xyz789 projects + scratch', used: 820, quota: 1024, mine: 210, people: {} },
  ] },
}

const p = (name: string, nodes: number, used: number, total: number, gu: number, gt: number, running: number,
  pending: number, up = true): Partition =>
  ({ name, up, nodes, cpus_used: used, cpus_total: total, gpus_used: gu, gpus_total: gt, running, pending })

const LOAD: Record<string, Partition[]> = {
  wulver: [p('general', 97, 11682, 12416, 0, 0, 211, 102), p('gpu', 28, 1373, 3584, 81, 112, 79, 12),
    p('bigmem', 4, 512, 768, 0, 0, 6, 0), p('debug', 2, 12, 256, 0, 0, 3, 0)],
  yale: [p('day', 180, 9104, 11520, 0, 0, 1830, 2409), p('week', 40, 2290, 2560, 0, 0, 212, 64),
    p('gpu', 36, 1102, 1728, 98, 144, 101, 37), p('devel', 4, 31, 256, 0, 0, 12, 0),
    p('scavenge', 260, 0, 0, 0, 0, 0, 0, false)],
  sdsc: [p('compute', 728, 70210, 93184, 0, 0, 1406, 0), p('shared', 32, 2890, 4096, 0, 0, 640, 0),
    p('gpu', 52, 1420, 2080, 166, 208, 61, 0), p('debug', 8, 64, 1024, 0, 0, 4, 0)],
}

const connected = (cluster: unknown) => {
  if (!LOAD[String(cluster)] || !demoConnected(String(cluster))) throw new Error('Connect to this cluster first')
  return String(cluster)
}

export const answers: Record<string, unknown> = {
  'usage.accounts': ({ cluster }: Record<string, unknown>) => ACCOUNTS[connected(cluster)],
  'usage.allocations': ({ cluster }: Record<string, unknown>): Allocations =>
    ({ groups: ACCOUNTS[connected(cluster)].map(allocation), me: 'jdoe' }),
  'usage.people': (params: Record<string, unknown>) => (connected(params.cluster), people(params)),
  'usage.storage': ({ cluster }: Record<string, unknown>) => STORAGE[connected(cluster)],
  'usage.load': ({ cluster }: Record<string, unknown>) => LOAD[connected(cluster)],
}
