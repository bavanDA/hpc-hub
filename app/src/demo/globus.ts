// Demo data for the Globus page: made-up collections, folders and transfers.
import type { Collection, GlobusCluster, GlobusStatus, Item, Listing, Task, Want } from '../types/globus'

const clusters: GlobusCluster[] = [
  { id: 'wulver', name: 'Wulver (NJIT)', collection_id: 'a1b2c3d4-0000-4000-8000-000000000001',
    collection_name: 'NJIT Wulver' },
  { id: 'yale', name: 'Yale Bouchet', collection_id: 'a1b2c3d4-0000-4000-8000-000000000002',
    collection_name: 'Yale Bouchet Storage' },
  { id: 'sdsc', name: 'SDSC Expanse', collection_id: 'a1b2c3d4-0000-4000-8000-000000000003',
    collection_name: 'SDSC Expanse Lustre' },
]
const wants: Want[] = [{ cluster: 'sdsc', name: 'SDSC Expanse', collection: 'SDSC Expanse Lustre', kind: 'consent',
  domains: [], message: 'Globus needs extra permission for this collection' }]
let state = { client_id: 'abc123de-0000-4000-8000-0000000000aa', signed_in: true }

const status = (): GlobusStatus => ({ ...state, clusters, wants })

const dir = (name: string, modified = '2026-10-21 14:02'): Item => ({ name, is_dir: true, size: 0, modified })
const file = (name: string, size: number, modified = '2026-10-22 09:15'): Item =>
  ({ name, is_dir: false, size, modified })

const TREE: Record<string, Item[]> = {
  '/home/jdoe/': [dir('data'), dir('projects', '2026-10-18 11:40'), dir('results'), dir('scripts', '2026-09-30 16:21'),
    file('README.md', 2481), file('environment.yml', 734, '2026-08-12 10:03'), file('train.sbatch', 1210)],
  '/home/jdoe/data/': [dir('raw'), dir('processed'), file('samples.csv', 48_213_442),
    file('labels.parquet', 3_904_118)],
  '/home/jdoe/results/': [dir('run-01'), dir('run-02'), file('summary.json', 18_204)],
  '/gpfs/home/jdoe/': [dir('mygroup'), dir('models', '2026-10-20 08:55'), dir('notebooks'),
    file('checkpoint-12.pt', 1_284_110_336, '2026-10-23 22:41'), file('notes.txt', 902)],
}

function ls({ cluster, path }: { cluster: string; path?: string }): Listing {
  const c = clusters.find((x) => x.id === cluster)!
  const base = { cluster, collection: c.collection_name, path: path ?? '', items: [] }
  if (cluster === 'sdsc') return { ...base, state: 'consent', want: wants[0] }
  const home = cluster === 'yale' ? '/gpfs/home/jdoe/' : '/home/jdoe/'
  const at = path ? (path.endsWith('/') ? path : path + '/') : home
  return { ...base, state: 'ok', path: at, items: TREE[at] ?? [file('output.log', 20_480), file('config.toml', 512)] }
}

const found: Collection[] = [
  { id: 'a1b2c3d4-0000-4000-8000-000000000003', name: 'SDSC Expanse Lustre', owner: 'admin@sdsc.edu',
    kind: 'GCSv5_mapped_collection', mine: false, best: true },
  { id: 'a1b2c3d4-0000-4000-8000-000000000004', name: 'SDSC Expanse Projects', owner: 'admin@sdsc.edu',
    kind: 'GCSv5_mapped_collection', mine: false, best: false },
  { id: 'a1b2c3d4-0000-4000-8000-000000000005', name: 'Expanse test', owner: 'jdoe@example.edu',
    kind: 'GCSv5_guest_collection', mine: false, best: false },
]

const task = (t: Partial<Task>): Task => ({ task_id: '', label: '', status: 'SUCCEEDED', nice_status: '', problem: '',
  source: 'NJIT Wulver', destination: 'Yale Bouchet Storage', bytes: 0, files_done: 0, files: 0, rate: 0,
  request_time: '2026-10-24 09:30', active: false, cancelled: false, ...t })

const tasks: Task[] = [
  task({ task_id: 't1', label: 'HPC Hub data', status: 'ACTIVE', bytes: 1_824_000_000, files_done: 12, files: 40,
    rate: 48_200_000, active: true, request_time: '2026-10-24 10:12' }),
  task({ task_id: 't2', label: 'HPC Hub checkpoint-12.pt', source: 'Yale Bouchet Storage',
    destination: 'NJIT Wulver', bytes: 1_284_110_336, files_done: 1, files: 1, request_time: '2026-10-24 08:47' }),
  task({ task_id: 't3', label: 'HPC Hub results', status: 'FAILED', bytes: 0, files: 3,
    destination: 'SDSC Expanse Lustre', request_time: '2026-10-23 17:05' }),
]

export const answers: Record<string, unknown> = {
  'globus.status': status,
  'globus.set_client': ({ id }: { id: string }) => { state = { ...state, client_id: id }; return status() },
  'globus.login_url': { id: 'demo', url: 'https://auth.globus.org/v2/oauth2/authorize?client_id=abc123&scope=urn' +
    '%3Aglobus%3Aauth%3Ascope%3Atransfer.api.globus.org%3Aall&response_type=code', fresh: true, domain: '', what: '' },
  'globus.consent_url': { id: 'demo', url: 'https://auth.globus.org/v2/oauth2/authorize?client_id=abc123',
    fresh: false, domain: '', what: 'SDSC Expanse' },
  'globus.finish_login': () => { state = { ...state, signed_in: true }; return status() },
  'globus.logout': () => { state = { ...state, signed_in: false }; return status() },
  'globus.check': () => ({ ...status(), changes: [] }),
  'globus.collections': ({ query }: { query?: string }) => ({ query: query || 'expanse', results: found }),
  'globus.set_collection': status,
  'globus.ls': ls,
  'globus.mkdir': null,
  'globus.transfer': { task_id: 't9' },
  'globus.tasks': tasks,
  'globus.cancel': null,
  'globus.start_personal': null,
}
