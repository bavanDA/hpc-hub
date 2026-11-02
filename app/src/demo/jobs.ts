// Demo data for the Jobs page: made-up jobs on Wulver and Yale, as jobs.list sends them.
import type { Job, JobDetails, JobList } from '../types/jobs'
import type { Account } from '../types/usage'

const ME = 'jdoe'
const ACTIVE = ['RUNNING', 'PENDING', 'COMPLETING']

function seconds(t: string): number {
  const [d, rest] = t.includes('-') ? t.split('-') : ['0', t]
  const p = rest.split(':').map(Number)
  const [h, m, s] = p.length === 3 ? p : p.length === 2 ? [0, ...p] : [p[0], 0, 0]
  return Number(d) * 86400 + h * 3600 + m * 60 + s
}

// what hpc_hub/compute/jobs.py duration_text and reason_text say
function words(total: number): string {
  const d = Math.floor(total / 86400), h = Math.floor((total % 86400) / 3600), m = Math.floor((total % 3600) / 60)
  if (d) return `${d} day${d > 1 ? 's' : ''}${h ? ` ${h} h` : ''}`
  if (h) return `${h} h${m ? ` ${m} min` : ''}`
  return m ? `${m} min` : 'under 1 min'
}
const REASONS: Record<string, string> = {
  '(Priority)': 'Waiting: higher-priority jobs go first', '(Resources)': 'Waiting: not enough free nodes yet',
}

const one = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function job(job_id: string, name: string, user: string, partition: string, qos: string, state: string,
  elapsed: string, limit: string, cpus: number, mem: string, where: string, billing = cpus): Job {
  const factor = qos === 'low' ? 0 : 1
  const rate = (billing * factor) / 3600
  const su_spent = rate * seconds(elapsed), su_max = rate * seconds(limit)
  const su = !factor ? 'free' : ACTIVE.includes(state)
    ? `${one(su_spent)} / ${Math.round(su_max).toLocaleString('en-US')}` : one(su_spent)
  return { job_id, name, user, partition, qos, state, elapsed, limit, cpus: String(cpus), mem, where, billing, factor,
    from_app: name.startsWith('hpc-hub'), su_spent, su_max, su, seconds: seconds(elapsed),
    limit_seconds: seconds(limit),
    elapsed_text: state === 'PENDING' ? '' : words(seconds(elapsed)), limit_text: words(seconds(limit)),
    reason: state === 'PENDING' ? REASONS[where] ?? 'Waiting to start' : '',
    qos_shown: ['', 'normal', partition].includes(qos) ? '' : qos,
    cancellable: user === ME && ['RUNNING', 'PENDING'].includes(state) }
}

const WULVER_MINE = [
  job('123456', 'hpc-hub-node', ME, 'general', 'standard', 'RUNNING', '1:12:05', '4:00:00', 4, '16G', 'n0042'),
  job('123470', 'train-model', ME, 'gpu', 'standard', 'RUNNING', '3:41:10', '12:00:00', 8, '64G', 'n0105', 40),
  job('123401', 'preprocess', ME, 'debug', 'debug', 'RUNNING', '8:44', '30:00', 1, '4G', 'n0001'),
  job('123488', 'sweep_17', ME, 'general', 'low', 'PENDING', '0:00', '2:00:00', 2, '8G', '(Priority)'),
  job('123489', 'sweep_18', ME, 'general', 'low', 'PENDING', '0:00', '2:00:00', 2, '8G', '(Priority)'),
]

const WULVER_HISTORY = [
  ...WULVER_MINE,
  job('123399', 'sweep_16', ME, 'general', 'low', 'COMPLETED', '1:48:12', '2:00:00', 2, '8G', 'n0071'),
  job('123377', 'train-model', ME, 'gpu', 'standard', 'TIMEOUT', '12:00:21', '12:00:00', 8, '64G', 'n0102', 40),
  job('123350', 'eval', ME, 'gpu', 'standard', 'COMPLETED', '0:42:09', '2:00:00', 4, '32G', 'n0103', 20),
  job('123341', 'plot-figures', ME, 'general', 'standard', 'FAILED', '0:00:14', '1:00:00', 1, '4G', 'n0007'),
  job('123322', 'hpc-hub-node', ME, 'general', 'standard', 'CANCELLED', '3:58:40', '4:00:00', 4, '16G', 'n0042'),
  job('123310', 'download-data', ME, 'debug', 'debug', 'COMPLETED', '0:12:31', '0:30:00', 1, '4G', 'n0001'),
  job('123288', 'sweep_15', ME, 'general', 'low', 'OUT_OF_MEMORY', '0:31:02', '2:00:00', 2, '8G', 'n0068'),
]

const OTHERS = ['asmith', 'bkim', 'cwong', 'dpatel', 'elopez']
const NAMES = ['md-run', 'gromacs', 'bert-ft', 'vasp-relax', 'array_7', 'jupyter', 'cfd-sim', 'rnaseq']
const WULVER_ALL = [
  ...WULVER_MINE,
  ...Array.from({ length: 26 }, (_, i) => {
    const pending = i % 4 === 3
    const gpu = i % 3 === 0
    return job(String(123500 + i * 7), NAMES[i % NAMES.length], OTHERS[i % OTHERS.length], gpu ? 'gpu' : 'general',
      i % 5 === 0 ? 'low' : 'standard', pending ? 'PENDING' : 'RUNNING',
      pending ? '0:00' : `${(i * 3) % 23}:${String((i * 17) % 60).padStart(2, '0')}:05`,
      gpu ? '1-00:00:00' : '3-00:00:00', gpu ? 16 : 32 + (i % 4) * 16, gpu ? '128G' : '96G',
      pending ? (i % 8 === 3 ? '(Resources)' : '(Priority)') : `n0${String(10 + i * 3).padStart(3, '0')}`,
      gpu ? 64 : undefined)
  }),
]

// My group: yours plus the jobs of the people in your Slurm account
const WULVER_GROUP = [...WULVER_MINE, ...WULVER_ALL.filter((j) => ['asmith', 'bkim'].includes(j.user)).slice(0, 8)]

const YALE_MINE = [
  job('8812345', 'hpc-hub-node', ME, 'day', 'normal', 'RUNNING', '0:24:51', '4:00:00', 2, '16G', 'r812u03n02'),
  job('8812391', 'alphafold', ME, 'gpu', 'normal', 'PENDING', '0:00', '1-00:00:00', 8, '64G', '(Resources)', 24),
]
const YALE_HISTORY = [
  ...YALE_MINE,
  job('8811020', 'alphafold', ME, 'gpu', 'normal', 'COMPLETED', '6:12:44', '1-00:00:00', 8, '64G', 'r905u17n01', 24),
  job('8810233', 'stats-r', ME, 'day', 'normal', 'COMPLETED', '0:51:10', '6:00:00', 4, '16G', 'r812u05n01'),
]

const ACCOUNTS: Record<string, Account[]> = {
  wulver: [{ account: 'mygroup', quota: 300000, used: 184520, mine: 21340, period: '', rate: 0 }],
  yale: [{ account: 'mygroup', quota: 0, used: 48210, mine: 9120, period: 'FY27', rate: 0.012 }],
}

const JOBS: Record<string, Record<string, Job[]>> = {
  wulver: { mine: WULVER_MINE, group: WULVER_GROUP, history: WULVER_HISTORY, all: WULVER_ALL },
  yale: { mine: YALE_MINE, group: YALE_MINE, history: YALE_HISTORY, all: YALE_MINE },
}

function find(cluster: string, id: string): Job | undefined {
  return Object.values(JOBS[cluster] ?? {}).flat().find((j) => j.job_id === id)
}

function details({ cluster, job_id }: Record<string, unknown>): JobDetails {
  const j = find(String(cluster), String(job_id))
  if (!j) throw new Error('Job not found')
  const active = ['RUNNING', 'PENDING'].includes(j.state)
  // started at 09:31; a running job ends when its time is up, a finished one ended after its run time
  const at = (secs: number) => {
    const t = new Date(2026, 9, 24, 9, 31 + Math.round(secs / 60))
    return `${t.toLocaleString('en-US', { month: 'short' })} ${t.getDate()}, ${String(t.getHours()).padStart(2, '0')}:${
      String(t.getMinutes()).padStart(2, '0')}`
  }
  const start = j.state === 'PENDING' ? '' : at(0)
  const end = start && at(active ? j.limit_seconds : j.seconds)
  const dir = `/project/mygroup/${ME}/${j.name}`
  const STATE: Record<string, string> = { RUNNING: 'Running', COMPLETED: 'Finished', FAILED: 'Failed',
    CANCELLED: 'Cancelled', TIMEOUT: 'Ran out of time' }
  const groups = [
    { title: 'Status', rows: [
      ['State', j.state === 'PENDING' ? j.reason : STATE[j.state] ?? j.state],
      ['Run time', j.state === 'PENDING' ? `${j.limit_text} asked` : `${j.elapsed_text} of ${j.limit_text}`],
      ['Started', start], [active ? 'Ends' : 'Ended', end], ['Submitted', 'Oct 24, 09:30'],
      ['Exit code', active ? '' : j.state === 'COMPLETED' ? '0, finished without errors'
        : '1, the program reported an error']] },
    { title: 'Resources', rows: [
      ['Node', j.state === 'PENDING' ? '' : j.where], ['Cores', j.cpus], ['Memory', j.mem.replace(/G$/, ' GB')],
      ['GPU', j.partition === 'gpu' ? '2 × A100' : ''], ['Queue', j.partition], ['Billing', j.qos_shown],
      ['Charged to', 'mygroup']] },
    { title: 'Files', rows: [['Work folder', dir], ['Output', `${dir}/slurm-${j.job_id}.out`]] },
  ].map((g) => ({ title: g.title, rows: g.rows.filter(([, v]) => v).map(([label, value]) => ({ label, value })) }))
  const text = [`JobId=${j.job_id} JobName=${j.name}`,
    `   UserId=${j.user}(51234) GroupId=mygroup(5000) Account=mygroup`,
    `   JobState=${j.state} Reason=${j.state === 'PENDING' ? j.where.slice(1, -1) : 'None'} ExitCode=0:0`,
    `   RunTime=${j.elapsed} TimeLimit=${j.limit} TimeMin=N/A`, `   Partition=${j.partition} QOS=${j.qos}`,
    `   NodeList=${j.state === 'PENDING' ? '(null)' : j.where} NumNodes=1 NumCPUs=${j.cpus} NumTasks=1`,
    `   AllocTRES=cpu=${j.cpus},mem=${j.mem},node=1,billing=${j.billing}`, `   WorkDir=${dir}`,
    `   StdErr=${dir}/slurm-${j.job_id}.out`, `   StdOut=${dir}/slurm-${j.job_id}.out`].join('\n')
  return { groups, text }
}

function list({ cluster, scope }: Record<string, unknown>): JobList {
  if (!JOBS[String(cluster)]) throw new Error('Connect to SDSC Expanse first')
  return { jobs: JOBS[String(cluster)][String(scope)] ?? [], user: ME, accounts: ACCOUNTS[String(cluster)],
    app_job: cluster === 'wulver' ? '123456' : '' }
}

export const answers: Record<string, unknown> = {
  'jobs.list': list,
  'jobs.details': details,
  'jobs.inside': ({ job_id }: Record<string, unknown>) => job_id === '123456'
    ? { sessions: ['Claude: thesis', 'Terminal'], app_node: true } : { sessions: [], app_node: false },
  'jobs.cancel': () => new Promise((done) => setTimeout(() => done({ gone: true }), 1200)),
}
