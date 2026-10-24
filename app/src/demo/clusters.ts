// Demo data for the Clusters page.
import type { Cluster, Session } from '../types'

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
  { id: 'wulver', state: 'Connected', connected: true, node: 'n0042', job: '123456', owned: true },
  { id: 'yale', state: 'Connected', connected: true },
  { id: 'sdsc', state: 'Disconnected', connected: false },
]

export const answers: Record<string, unknown> = {
  'app.version': { version: 'demo' }, 'clusters.list': clusters, 'sessions.list': sessions,
}
