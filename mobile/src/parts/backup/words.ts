// The phone's backup words where they differ from @shared/components/backup/copy: what the user gets, not how the
// app does it, one progress line, times as "3 h 48 min", and a plan item's reason only when it adds something.
import { CLASS, count, gb, when } from '@shared/components/backup/copy'
import { human } from '@shared/components/clusters/time'
import type { PlanItem, Progress, Scan } from '@shared/types/backup'

export const phone = {
  hint: 'Takes about 20 minutes. You can close the app.',
  agent: 'Let Claude sort unclear folders',
  agentHint: "It reads names, READMEs and job scripts. It can't run anything.",
  onlySoonOn: 'Files safe for now stay in scratch.',
  onlySoonOff: 'Everything important, also files safe for now.',
  git: 'Git repo, copied whole',
  checking: 'Checking the space',
  closeApp: 'You can close the app.',
  weeklyHint: 'Runs at the set time, even with your laptop off.',
  replaced: (n: number) => `${count(n)} older ${n === 1 ? 'file' : 'files'} in project get replaced. The old `
    + `${n === 1 ? 'one is' : 'ones are'} kept.`,
  banner: (soonest: number) => `Some scratch files go ${when(soonest)}.`,
  ready: (files: number) => `Ready to copy ${count(files)} ${files === 1 ? 'file' : 'files'}.`,
  files: (after: number, limit: number) => `Project will hold ${count(after)} files. It allows ${count(limit)}.`,
}

/** The one progress line of a check: "12,400 of about 51,119 files", without "about" once it is exact. */
export function scanLine(scan: Scan | null): string {
  const p = scan?.progress ?? {}
  if (scan?.state === 'scanning' && p.expected) {
    return `${count(p.checked ?? 0)} of ${p.done ? '' : 'about '}${count(p.expected)} files`
  }
  return scan?.detail || 'Waiting for a node'
}

/** The one progress line of a copy: "12.4 GB of 45.2 GB · about 3 h 48 min left". */
export function copyLine(p: Progress | null, total: number): string {
  if (!p) return 'Starting'
  if (p.state === 'copying') {
    const left = p.eta_s ? ` · about ${human(Math.max(1, Math.round(p.eta_s / 60)))} left` : ''
    return `${gb(p.done_bytes)} of ${gb(total)}${left}`
  }
  return p.detail || 'Starting'
}

const GIT = /git repo/i

export const isGit = (i: PlanItem) => GIT.test(i.why)

/** Kept without saying why: of course results, code, writing and inputs are kept. */
const PLAIN_KEEP = new Set(['results', 'code', 'writing', 'inputs'])

/** Why an item is kept or left out, without repeating its kind ("Code." under Code), the git note or the obvious. */
export function reason(i: PlanItem): string {
  if (isGit(i) || (i.keep && i.by === 'rule' && PLAIN_KEEP.has(i.kind))) return ''
  const kind = CLASS[i.kind]
  let why = i.why.trim()
  if (why.toLowerCase().startsWith(kind.toLowerCase())) why = why.slice(kind.length).replace(/^[.:,]\s*/, '')
  if (!why) return ''
  why = why.charAt(0).toUpperCase() + why.slice(1)
  return /[.]$/.test(why) ? why : `${why}.`
}
