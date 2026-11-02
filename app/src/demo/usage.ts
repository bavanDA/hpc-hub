// Demo data for the Usage page: made-up accounts, people, quotas and partitions on Wulver and Yale.
import type { Account, Partition, People, Person, Storage } from '../types/usage'

const ACCOUNTS: Record<string, Account[]> = {
  wulver: [
    { account: 'mygroup', quota: 300000, used: 184520, mine: 21340, period: '', rate: 0 },
    { account: 'abc123', quota: 50000, used: 46100, mine: 0, period: '', rate: 0 },
  ],
  yale: [{ account: 'pi_doe', quota: 0, used: 48210, mine: 9120, period: 'FY27', rate: 0.012 }],
}

// SU charged and core hours over the last 30 days; other periods scale from it
const PEOPLE: Record<string, [string, string, number, number][]> = {
  mygroup: [['asmith', 'Alex Smith', 9120, 11400], ['jdoe', 'Jane Doe', 6210, 9800], ['bkim', 'Bo Kim', 3480, 3480],
    ['cwong', 'Chris Wong', 940, 2210], ['dpatel', 'Dev Patel', 60, 120], ['elopez', 'Eva Lopez', 0, 0],
    ['fnguyen', 'Finn Nguyen', 0, 0]],
  abc123: [['cwong', 'Chris Wong', 4210, 4210], ['asmith', 'Alex Smith', 1990, 2050], ['jdoe', 'Jane Doe', 0, 0]],
  pi_doe: [['jdoe', 'Jane Doe', 9120, 9120], ['mlee', 'Mia Lee', 21400, 21400], ['tross', 'Tom Ross', 17690, 18020]],
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
}

const connected = (cluster: unknown) => {
  if (!LOAD[String(cluster)]) throw new Error('Connect to SDSC Expanse first')
  return String(cluster)
}

export const answers: Record<string, unknown> = {
  'usage.accounts': ({ cluster }: Record<string, unknown>) => ACCOUNTS[connected(cluster)],
  'usage.people': (params: Record<string, unknown>) => (connected(params.cluster), people(params)),
  'usage.storage': ({ cluster }: Record<string, unknown>) => STORAGE[connected(cluster)],
  'usage.load': ({ cluster }: Record<string, unknown>) => LOAD[connected(cluster)],
}
