// Demo data for the Scheduled agents page: Wulver has three schedules, Yale none, Expanse is not connected.
import type { Schedule, ScheduleLog, ScheduleOptions, ScheduleStatus } from '../types/schedules'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const AGENTS = [{ id: 'claude', name: 'Claude' }, { id: 'codex', name: 'ChatGPT' }, { id: 'agy', name: 'Antigravity' },
  { id: 'cursor', name: 'Cursor' }]
const rules = (role: string) => `Work on a new git branch named agent/${role}-<today's date> (if the folder is a git ` +
  'repository), make small commits with short messages, and do not push. If tests exist, run them before you ' +
  'commit. Finish with a short summary of what you changed and why.'
const presets = [
  { label: 'Clean the code', role: 'cleanup', task: 'Clean up the code in this folder without changing what it ' +
    'does: remove dead code and duplication, split files that are too long into small modules that each do one ' +
    'thing, and simplify where it clearly helps. ' + rules('cleanup') },
  { label: 'Find bugs and write tests', role: 'bugs', task: 'Look for bugs in this folder. Read the code, run the ' +
    'tests, and add tests for important logic that has none. For every real bug you find, first write a test that ' +
    'fails because of it, then fix it. ' + rules('bugs') },
  { label: 'Make my jobs faster', role: 'jobs', task: 'Make my Slurm jobs faster and cheaper. Look at my jobs from ' +
    'the last 7 days with sacct and at the job scripts in this folder. Find waste and change the scripts to fix ' +
    'it. ' + rules('jobs') },
  { label: 'Custom task', role: 'task', task: '' },
]
const profiles: Record<string, ScheduleOptions['profile']> = {
  wulver: { cpus: 4, mem_gb: 16, time: '04:00:00', partition: 'general', account: '', qos: '', gpus: 0 },
  yale: { cpus: 2, mem_gb: 16, time: '04:00:00', partition: 'day', account: '', qos: '', gpus: 0 },
}

function when(s: Schedule) {
  const days = [...s.days].sort()
  if (!days.length || days.length === 7) return `Every day at ${s.time}`
  if (days.join() === '1,2,3,4,5') return `Weekdays at ${s.time}`
  return `${days.map((d) => DAYS[d - 1]).join(', ')} at ${s.time}`
}


/** The next time at hh:mm on one of days (1 = Monday; none = every day), from now, as Slurm prints it. */
function next(time: string, days: number[] = []): string {
  const [h, m] = time.split(':').map(Number)
  const t = new Date()
  t.setHours(h, m, 0, 0)
  for (let i = 0; i < 8; i++, t.setDate(t.getDate() + 1)) {
    if (t.getTime() > Date.now() && (!days.length || days.includes(((t.getDay() + 6) % 7) + 1))) break
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(h)}:${pad(m)}:00`
}
/** The last run before now at time on one of days, in epoch seconds (when an earlier run would have started). */
function last(time: string, days: number[] = []): number {
  const [h, m] = time.split(':').map(Number)
  const t = new Date()
  t.setHours(h, m, 0, 0)
  for (let i = 0; i < 8; i++, t.setDate(t.getDate() - 1)) {
    if (t.getTime() < Date.now() && (!days.length || days.includes(((t.getDay() + 6) % 7) + 1))) break
  }
  return Math.round(t.getTime() / 1000)
}
function status(s: Schedule, extra: Partial<ScheduleStatus> = {}): ScheduleStatus {
  return { ...s, agent_name: AGENTS.find((a) => a.id === s.agent)?.name ?? s.agent, when: when(s), job_id: '',
    state: '', start: '', last_run: 0, last_log: '', ...extra }
}

const base = { enabled: true, compute: {}, minutes: 120, days: [] as number[] }
const lists: Record<string, ScheduleStatus[]> = {
  wulver: [
    status({ ...base, name: 'cleanup-thesis', agent: 'claude', folder: '/mmfs1/project/mygroup/jdoe/thesis',
      task: presets[0].task, time: '02:00', days: [1, 2, 3, 4, 5], minutes: 180 },
    { job_id: '812345', state: 'PENDING', start: next('02:00', [1, 2, 3, 4, 5]), last_run: last('02:00', [1, 2, 3, 4, 5]),
      last_log: '/home/jdoe/.hpc-hub/schedules/cleanup-thesis/logs/2026-10-24-0200.md' }),
    status({ ...base, name: 'bugs-solver', agent: 'codex', folder: '~/project/solver', task: presets[1].task,
      time: '03:30', days: [6, 7], compute: { cpus: 8, mem_gb: 32, gpus: 1, gpu_type: 'a100_10g', partition: 'gpu' } },
    { job_id: '812399', state: 'PENDING', start: next('03:30', [6, 7]), last_run: last('03:30', [6, 7]),
      last_log: '/home/jdoe/.hpc-hub/schedules/bugs-solver/logs/2026-10-23-0330.md' }),
    status({ ...base, name: 'jobs-home', agent: 'claude', folder: '~', task: presets[2].task, time: '06:00',
      enabled: false, minutes: 60 }),
    status({ ...base, name: 'backup-check', agent: 'claude', folder: '/scratch/jdoe', task: '', time: '03:00',
      days: [1], minutes: 30, runner: 'backup' },
    { job_id: '812500', state: 'PENDING', start: next('03:00', [1]), last_run: last('03:00', [1]) }),
  ],
  yale: [],
}

const LOG = `I looked at the code in thesis and made three small changes on the branch agent/cleanup-2026-10-24.

1. Removed plot_old.py. Nothing imports it any more.
2. Split analysis.py (840 lines) into load.py, fit.py and plots.py. Each does one thing now.
3. Folded two copies of the unit conversion into units.py.

All 42 tests pass. Nothing was pushed.
`

function get(cluster: string) {
  if (!lists[cluster]) throw new Error('Connect to SDSC Expanse first')
  return lists[cluster]
}
const find = (cluster: string, name: string) => {
  const st = get(cluster).find((s) => s.name === name)
  if (!st) throw new Error(`No schedule ${name}`)
  return st
}
const slug = (name: string) => name.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) ||
  'agent'
const later = <T>(value: () => T, ms = 500) => new Promise<T>((done, fail) => setTimeout(() => {
  try { done(value()) } catch (e) { fail(e) }
}, ms))

export const answers: Record<string, unknown> = {
  'schedules.options': ({ cluster }: { cluster: string }): ScheduleOptions => ({ agents: AGENTS, presets, days: DAYS,
    folder: '~', profile: profiles[cluster] ?? profiles.wulver, root: '~/.hpc-hub/schedules' }),
  'schedules.list': ({ cluster }: { cluster: string }) => later(() => get(cluster).map((s) => ({ ...s })), 300),
  'schedules.save': ({ cluster, schedule, old_name }: { cluster: string; schedule: Schedule; old_name: string }) =>
    later(() => {
      const s = { ...schedule, name: slug(schedule.name) }
      if (!s.task.trim()) throw new Error('Write a task')
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) throw new Error('Time must look like 02:00')
      if (s.name !== old_name && get(cluster).some((x) => x.name === s.name)) {
        throw new Error(`A schedule named ${s.name} exists`)
      }
      const old = get(cluster).find((x) => x.name === old_name)
      lists[cluster] = get(cluster).filter((x) => x.name !== old_name)
      lists[cluster].push(status(s, s.enabled ? { job_id: '812400', state: 'PENDING', start: '2026-10-25T' +
        `${s.time}:00`, last_run: old?.last_run ?? 0, last_log: old?.last_log ?? '' } : {}))
      return get(cluster)
    }),
  'schedules.toggle': ({ cluster, name, enabled }: { cluster: string; name: string; enabled: boolean }) =>
    later(() => {
      const st = find(cluster, name)
      Object.assign(st, { enabled }, enabled ? { job_id: '812401', state: 'PENDING', start: `2026-10-25T${st.time}:00` }
        : { job_id: '', state: '', start: '' })
      return get(cluster)
    }),
  'schedules.run_now': ({ cluster, name }: { cluster: string; name: string }) => later(() => {
    find(cluster, name)
    return { job: '812402' }
  }),
  'schedules.delete': ({ cluster, name }: { cluster: string; name: string }) => later(() => {
    lists[cluster] = get(cluster).filter((s) => s.name !== name)
  }),
  'schedules.log': ({ cluster, name }: { cluster: string; name: string }): ScheduleLog => {
    const st = find(cluster, name)
    return { path: st.last_log, text: st.last_log ? LOG : '', folder: `~/.hpc-hub/schedules/${name}/logs` }
  },
}
