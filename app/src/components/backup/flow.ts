import type { Choice, Plan, Scan } from '../../types/backup'
import { REMAKE } from './classes'

export type Step = 'start' | 'scanning' | 'risk' | 'plan' | 'space' | 'copy' | 'done'
export type Options = { horizon: number; whole: boolean; everything: boolean; codeToHome: boolean }

// The flow's place per cluster, kept outside React so it survives leaving the page
export type Kept = { step: Step; scan: string; copy: string; job: string; tried: string }

const RUNNING = new Set(['starting', 'waiting_for_node', 'scanning', 'thinking'])
export const scanRunning = (s?: Scan | null) => !!s && RUNNING.has(s.state)

/** The id backup.progress follows: the copy while it runs, the check during its trial run, else none. */
export function watchedId(step: Step, k: Pick<Kept, 'scan' | 'copy' | 'tried'>): string {
  if (step === 'copy') return k.copy
  return step === 'space' && k.tried === 'running' ? k.scan : ''
}

export function planParams(cluster: string, scan: string, o: Options, changes: Choice[]) {
  return {
    cluster, id: scan, horizon_days: o.horizon, scope: o.everything ? 'everything' : 'at_risk',
    whole_folders: o.whole, code_to_home: o.codeToHome, changes,
  }
}

/** Leaves out kept files that can be made again, biggest first, until the copy fits. */
export function leaveOutBiggest(plan: Plan): Choice[] {
  const s = plan.space
  let over = (s.after_gb - s.quota_gb) * 1024 ** 3
  const changes: Choice[] = []
  for (const i of [...plan.items].filter((x) => REMAKE.includes(x.kind) || x.kind === 'unsure')
    .sort((a, b) => b.bytes - a.bytes)) {
    if (over <= 0 && changes.length) break
    changes.push({ path: i.folder, class: i.kind, keep: false })
    over -= i.bytes
  }
  return changes
}
