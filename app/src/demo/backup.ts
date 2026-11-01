// Demo answers for the backup agent (backup.py). A scan "runs" for a few seconds, the trial run takes two, the copy
// about ten; your choices move items between kept and left out and change the plan's numbers and hash.
import type { BackupAlert, BackupPolicy, Choice, Plan, PlanItem, Progress, Reminders, Scan } from '../types/backup'
import { plan as basePlan, result, summary } from './backup_data'

const GB = 1024 ** 3
// ?backup=full (project nearly full), tight (the copy doesn't fit), partial (busy files), mismatch: for design work
const knob = typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('backup') ?? ''
const QUOTA = { full: 1640, tight: 1500 }[knob] ?? summary.destinations[0].quota_gb
const RESULT = {
  ...result, busy: knob === 'partial' ? result.busy : [], mismatches: knob === 'mismatch' ? 3 : 0,
  failed: knob === 'partial' ? [{ path: 'misc/locked.bin', why: 'No read permission' }] : [],
}
const later = <T>(value: () => T, ms = 300) => new Promise<T>((done, fail) => setTimeout(() => {
  try { done(value()) } catch (e) { fail(e) }
}, ms))

const destinations = summary.destinations.map((d, i) => i ? d
  : { ...d, quota_gb: QUOTA, free_gb: Math.max(0, QUOTA - d.used_gb) })
const policy: BackupPolicy = {
  scratch: summary.scratch, destinations, purge: summary.purge,
  scratch_fill_pct: summary.scratch_fill_pct, files_in_scratch: summary.files,
  no_tricks: 'HPC Hub never touches files to keep them longer. Clusters do not allow that.',
}

const scans: (Scan & { at: number })[] = [{
  id: summary.id, cluster: 'wulver', scratch: summary.scratch, horizon: 14, group: false, agent: 'claude',
  state: 'done', detail: 'Done', progress: { checked: summary.files, expected: summary.files, done: true },
  partial: false, at: 0,
}]
const choices: Record<string, Choice> = {}
const tried: Record<string, string> = {}  // scan id -> plan hash the trial run checked
const copies: Record<string, number> = {}  // scan id -> when the copy started
let reminders: Reminders = { enabled: false, days: [1], time: '03:00', horizon_days: 14 }

function scanNow(s: Scan & { at: number }): Scan {
  const t = (Date.now() - s.at) / 1000
  if (s.state === 'cancelled' || s.at === 0) return s
  const n = Math.min(Math.round(t * 18000), summary.files)
  const state = t < 1.5 ? 'starting' : t < 4.5 ? 'scanning' : t < 6 ? 'thinking' : 'done'
  const detail = {
    starting: 'Waiting for a node', scanning: `Checked ${n.toLocaleString('en-US')} of about ${summary.files.toLocaleString('en-US')} files`,
    thinking: 'The agent is reading your folders', done: 'Done',
  }[state]
  return { ...s, state, detail, progress: { checked: n, expected: summary.files, done: state === 'done' } }
}

function hash(text: string) {
  let h = 0
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h.toString(16).padStart(16, '0').slice(-16)
}

function makePlan(id: string): Plan {
  const all = [...basePlan.items, ...basePlan.left_out].map((i): PlanItem => {
    const mine = choices[`${i.folder}|${i.kind}`] ?? choices[`${i.folder}|`]
    return mine ? { ...i, keep: mine.keep, by: 'you' } : i
  })
  const items = all.filter((i) => i.keep)
  const bytes = items.reduce((n, i) => n + i.bytes, 0)
  const files = items.reduce((n, i) => n + i.files, 0)
  const d = destinations[0]
  const after = d.used_gb + bytes / GB
  const pct = Math.round((100 * after) / d.quota_gb)
  const fits = after <= d.quota_gb
  const warn = !fits ? `This does not fit. Project has ${Math.round(d.quota_gb - d.used_gb)} GB free and the copy needs ${Math.round(bytes / GB)} GB.`
    : pct >= 90 ? `This fills project to ${pct}%. Jobs that write to project can fail when it is full.` : ''
  const h = Object.keys(choices).length ? hash(JSON.stringify(choices)) : basePlan.hash
  return {
    ...basePlan, scan_id: id, items, left_out: all.filter((i) => !i.keep), files, bytes, hash: h,
    exact: tried[id] === h, will_replace: 0, busy: tried[id] === h ? RESULT.busy : [],
    space: { ...basePlan.space, after_gb: Math.round(after * 10) / 10, quota_gb: d.quota_gb, pct_after: pct, fits,
      warn },
  }
}

function copyNow(id: string): Progress {
  const t = (Date.now() - copies[id]) / 1000
  const p = makePlan(id)
  const share = Math.min(t / 9, 1)
  const state = t < 9 ? 'copying' : t < 11 ? 'verifying' : 'done'
  const done = state === 'copying' ? Math.round(p.bytes * share) : p.bytes
  const left = Math.max(Math.round((9 - t) * 40), 1)
  const detail = {
    copying: `${(done / GB).toFixed(1)} GB done, about ${left} minutes left`,
    verifying: 'Checking every file against the one in scratch', done: 'Done',
  }[state]
  return { state, done_bytes: done, total_bytes: p.bytes, files_done: Math.round(p.files * share), files_total: p.files,
    eta_s: state === 'copying' ? left * 60 : 0, resubmits: 0, detail }
}

export const answers: Record<string, unknown> = {
  'backup.policy': () => later(() => policy),
  'backup.scan': ({ agent = '' }: { agent?: string }) => later(() => {
    const id = `${summary.id.slice(0, 16)}${Math.random().toString(16).slice(2, 6)}`
    scans.unshift({ ...scans[scans.length - 1], id, agent, state: 'starting', detail: 'Waiting for a node', at: Date.now() })
    return { id, job_id: '4242' }
  }),
  'backup.scans': () => later(() => scans.map(scanNow)),
  'backup.summary': ({ id }: { id: string }) => later(() => ({ ...summary, id, destinations })),
  'backup.plan': ({ id, changes = [] }: { id: string; changes?: Choice[] }) => later(() => {
    for (const c of changes) choices[`${c.path}|${c.class ?? ''}`] = c
    return makePlan(id)
  }, 500),
  'backup.dry_run': ({ id }: { id: string }) => later(() => {
    setTimeout(() => { tried[id] = makePlan(id).hash }, 2000)
    return { job_id: '4243' }
  }),
  'backup.start': ({ id, confirm }: { id: string; confirm: string }) => later(() => {
    const p = makePlan(id)
    if (confirm !== p.hash) throw new Error('The plan changed. Try it first again.')
    if (!p.exact) throw new Error('Try it first.')
    if (!p.space.fits) throw new Error(p.space.warn)
    copies[id] = Date.now()
    return { copy_id: id, job_id: '4244' }
  }),
  'backup.progress': ({ copy_id }: { copy_id: string }) => later(() => {
    if (copies[copy_id] === undefined) {
      return { state: tried[copy_id] ? 'tried' : 'trying', done_bytes: 0, total_bytes: 0, files_done: 0, files_total: 0,
        eta_s: 0, resubmits: 0, detail: tried[copy_id] ? 'Ready' : 'Making the list of files' }
    }
    return copyNow(copy_id)
  }),
  'backup.result': ({ copy_id }: { copy_id: string }) => later(() => {
    const p = makePlan(copy_id)
    return { ...RESULT, copied_files: p.files, bytes: p.bytes }
  }),
  'backup.cancel': ({ id }: { id: string }) => later(() => {
    const s = scans.find((x) => x.id === id)
    if (s) Object.assign(s, { state: 'cancelled', detail: 'Stopped' })
    delete copies[id]
    return {}
  }),
  'backup.reminders': () => later(() => reminders),
  'backup.set_reminders': (r: Reminders) => later(() => {
    reminders = { ...reminders, ...r, next: r.enabled ? '2026-11-02T03:00:00' : undefined }
    return reminders
  }),
  'backup.alerts': () => later((): BackupAlert[] => [{
    cluster: 'wulver', kind: 'at_risk', files: 50744, bytes: Math.round(260 * GB), soonest_days: 1,
    top_folder: 'runs/sweep-lr', title: 'Scratch on Wulver', text: '50,744 files in scratch will be deleted tomorrow. 260 GB.',
  }]),
}
