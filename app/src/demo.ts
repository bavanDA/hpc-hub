// Made-up answers for opening the UI in a plain browser (npm run dev, no Tauri): for design work and screenshots.
import type { Cluster, Session } from './types'

const profile = { cpus: 4, mem_gb: 16, time: '04:00:00', partition: 'general' }
const clusters: Cluster[] = [
  { id: 'wulver', name: 'Wulver (NJIT)', host: 'wulver.njit.edu', vpn: { enabled: true, gateway: 'vpn.njit.edu' },
    profile },
  { id: 'yale', name: 'Yale Bouchet', host: 'bouchet.ycrc.yale.edu',
    vpn: { enabled: true, gateway: 'access.yale.edu' }, profile: { ...profile, cpus: 2, partition: 'day' } },
  { id: 'sdsc', name: 'SDSC Expanse', host: 'login.expanse.sdsc.edu', vpn: { enabled: false, gateway: '' },
    profile: { ...profile, cpus: 2, partition: 'shared' } },
]

const sessions: Session[] = [
  { id: 'wulver', state: 'Connected', node: 'n0042', job: '123456' },
  { id: 'yale', state: 'Connected' },
  { id: 'sdsc', state: 'Disconnected' },
]

const answers: Record<string, unknown> = {
  'app.version': { version: 'demo' }, 'clusters.list': clusters, 'sessions.list': sessions,
}

export async function demoCall<T>(method: string): Promise<T> {
  if (!(method in answers)) throw new Error(`${method} has no demo answer`)
  return answers[method] as T
}
