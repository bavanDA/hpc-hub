// Every sentence of the backup agent's screens, desktop and phone (pages/Backup.tsx, mobile screens/Backup.tsx).
// Plain words, no "if", no long dashes, the cluster's name once per screen: the rest say "scratch" and "project".
import type { FileClass, Purge } from '../../types/backup'

const GB = 1024 ** 3

/** "38.2 GB", "260 GB", "1.62 TB" */
export function gb(bytes: number): string {
  const g = bytes / GB
  if (g >= 1000) return `${(g / 1024).toFixed(2)} TB`
  if (g >= 100) return `${Math.round(g)} GB`
  if (g >= 0.1) return `${g.toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

/** The same for numbers already in GB (space checks). */
export function gbOf(g: number): string {
  return g >= 1000 ? `${(g / 1024).toFixed(2)} TB` : `${g >= 100 ? Math.round(g) : g.toFixed(1)} GB`
}

export function count(n: number): string {
  return n.toLocaleString('en-US')
}

/** "Wulver (NJIT)" -> "Wulver" */
export function shortName(name: string): string {
  return name.split(' (')[0]
}

export const CLASS: Record<FileClass, string> = {
  results: 'Results', code: 'Code', writing: 'Writing and notes', inputs: 'Inputs and settings', logs: 'Logs',
  regen: 'Can be made again', checkpoint: 'Can be made again', unsure: 'Not sure',
}

/** Kinds of files that can be made again: the first to leave out when project is short of space. */
export const REMAKE: FileClass[] = ['regen', 'checkpoint']

function day(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

/** "in 5 days, on Friday, Nov 6", "tomorrow", "any day now" */
export function when(days: number | null): string {
  if (days == null) return ''
  if (days <= 0) return 'any day now'
  if (days === 1) return 'tomorrow'
  return `in ${days} days, on ${day(days)}`
}

export const start = {
  title: 'Backup agent',
  intro: (cluster: string, days: number) => `Scratch on ${cluster} deletes files after ${days} days. The backup agent `
    + 'finds what is about to go, picks what matters and copies it to your project folder. It never deletes anything.',
  noTimer: (cluster: string) => `Scratch on ${cluster} has no timer. Nothing here gets deleted by age.`,
  check: 'Check my scratch',
  anyway: 'Copy important work anyway',
  hint: 'Runs as a small job on a compute node, about 20 minutes. You can close the app.',
  agent: 'Let Claude sort the folders the rules can\'t place',
  agentHint: 'It reads names, READMEs and job scripts. It can\'t run anything.',
  last: (when: string) => `Last check ${when}.`,
  seeLast: 'See the last check',
}

export const scanning = {
  title: 'Checking your scratch',
  stop: 'Stop',
  failed: 'The check didn\'t finish',
  again: 'Check again',
}

export const risk = {
  headline: (files: number, horizon: number) => files
    ? `${count(files)} files in scratch will be deleted in the next ${horizon} days`
    : `Nothing in scratch gets deleted in the next ${horizon} days`,
  sub: (bytes: number, folders: number, soonest: number | null) => {
    const size = `${gb(bytes)} in ${folders} ${folders === 1 ? 'folder' : 'folders'}.`
    if (soonest == null) return size
    if (soonest <= 0) return `${size} Some could go any day now.`
    return `${size} The first ones go ${when(soonest)}.`
  },
  groups: [[0, 'Could be deleted any day now'], [7, 'Within a week'], [14, 'Within 2 weeks'],
    [Infinity, 'Later']] as const,
  basis: (cluster: string, p: Purge) => ({
    oldest: `Days are counted from the dates on each file. ${cluster} does not say which date it uses, so we count `
      + 'from the oldest one.',
    created: 'Days are counted from when each file was made. Where the file system does not keep that date, we use '
      + 'the oldest date on the file.',
    mtime: 'Days are counted from when each file last changed.',
    atime: 'Days are counted from when each file was last opened.',
  })[p.basis],
  full: (pct: number, cluster: string, days: number) =>
    `Scratch is ${pct}% full. ${cluster} may delete files sooner than ${days} days.`,
  partial: 'The check ran out of time before it saw every file. The numbers here are the least it found.',
  busy: 'A job is writing here right now.',
  plan: 'Make a plan',
  again: 'Check again',
  nothing: 'Your scratch is safe for now. HPC Hub can check again every week.',
}

export const plan = {
  title: 'The plan',
  keep: 'Keep',
  leave: 'Leave out',
  whole: 'Copy whole folders so each one stays complete',
  wholeHint: 'Git repositories are always copied whole.',
  onlySoon: (days: number) => `Only files deleted in the next ${days} days`,
  onlySoonHint: 'Off: everything important in scratch, also files that are safe for now.',
  by: { rule: '', agent: 'Claude', you: 'You' } as Record<string, string>,
  space: 'Check space',
  empty: 'Nothing is kept. Turn on a row to copy it.',
  leftEmpty: 'Nothing is left out.',
}

export const space = {
  title: 'Space in project',
  uses: (bytes: string, exact: boolean) => `This copy uses ${exact ? '' : 'about '}${bytes} of your project folder.`,
  after: (after: string, quota: string, pct: number) => `Project after the copy: ${after} of ${quota} (${pct}%).`,
  noQuota: (after: string) => `Project after the copy: ${after}. HPC Hub could not read its size limit.`,
  shared: (n: number) => `Your group shares this space. ${n} people use it.`,
  where: (dest: string) => `Copies go to ${dest}, in the same folders as in scratch.`,
  leaveBiggest: 'Leave out the biggest ones that can be made again',
  homeCode: 'Put code in home',
  homeCodeHint: 'Project here is not backed up. Your code fits in home, which is.',
  notBacked: 'Project on this cluster is not backed up either.',
  files: (adds: number, limit: number, has: number) =>
    `This adds ${count(adds)} files. Project allows ${count(limit)} and has ${count(has)}.`,
  tryFirst: 'Try it first',
  tryHint: 'A trial run lists every file and checks the space. Nothing is copied yet.',
  trying: 'Making the list of files',
  ready: (files: number, bytes: string) => `Ready: ${count(files)} files, ${bytes}.`,
  replaced: (n: number) => n
    ? `${count(n)} files in project are older than the ones in scratch. They get replaced, and the old ones are kept `
      + 'in .hpc-hub-replaced.'
    : 'Nothing in project gets replaced.',
  busy: (n: number) => `${count(n)} ${n === 1 ? 'file is' : 'files are'} busy and get copied next time.`,
  copy: (bytes: string) => `Copy ${bytes} to project`,
  back: 'Back to the plan',
}

export const copying = {
  title: (bytes: string) => `Copying ${bytes} to project`,
  job: (id: string) => `Runs as job ${id}. You can close the app.`,
  stop: 'Stop copying',
  stopTitle: 'Stop the copy?',
  stopText: 'Files copied so far stay in project. Start again later and it goes on from there.',
  keep: 'Keep copying',
  verifying: 'Checking every file against the one in scratch',
}

export const done = {
  title: (files: number) => `Done. ${count(files)} files are safe in project.`,
  checked: (how: string) => how === 'checksum'
    ? 'Every file was checked against the one in scratch. Nothing in scratch was changed or deleted.'
    : 'Every file was checked by size and date against the one in scratch. Nothing in scratch was changed or deleted.',
  notes: 'Notes on what was copied and left out:',
  open: 'Open in Files',
  weekly: 'Check again next week',
  partial: (copied: number, total: number, busy: number) =>
    `Copied ${count(copied)} of ${count(total)} files. ${busy} ${busy === 1 ? 'was' : 'were'} busy. `
    + `${busy === 1 ? 'It is' : 'They are'} in the list below. Copy ${busy === 1 ? 'it' : 'them'} later.`,
  failed: (n: number) => `${count(n)} ${n === 1 ? 'file' : 'files'} could not be read.`,
  mismatch: (n: number, help: string) => `${count(n)} ${n === 1 ? 'file still does' : 'files still do'} not match. `
    + `Scratch still has them. Try again, or write to ${help}.`,
  again: 'Copy again',
  newCheck: 'Check scratch again',
}

export const reminders = {
  title: 'Reminders',
  weekly: 'Check scratch every week',
  weeklyHint: 'A small job on the cluster, so it runs with your laptop off.',
  day: 'Day',
  time: 'Time',
  every: (dayName: string, time: string) => `Every ${dayName} at ${time}`,
  horizon: (days: number) => `Tell me when files are ${days} days from deletion`,
  next: (when: string) => `Next check ${when}.`,
  save: 'Save',
}

export const notices = {
  atRisk: (cluster: string) => `Scratch on ${cluster}`,
  done: 'Your backup is done',
  doneText: (files: number) => `${count(files)} files are safe in project.`,
}

export const banner = {
  files: (files: number, soonest: number) => `${count(files)} files in scratch will be deleted ${when(soonest)}.`,
  see: 'See the plan',
  usage: (days: number) => `Files here are deleted after ${days} days.`,
  usageLink: 'See what is at risk',
}

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Who to write to when copies don't match. Only help desks the clusters publish. */
export const HELP: Record<string, string> = { wulver: 'hpc@njit.edu' }
export const helpFor = (cluster: string) => HELP[cluster] ?? 'your cluster\'s help desk'
