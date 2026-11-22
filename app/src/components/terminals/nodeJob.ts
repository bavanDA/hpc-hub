// The Slurm job a terminal runs in, for the bar under it (2026-11-22, the owner: "show job id as well, in terminal so
// we can check if job really finish or not"). An agent's tab names its job: hpchub-<agent>-<job>-<tag>. Another
// terminal on a compute node runs in your job on that node. Your jobs come from jobs.list (squeue): a job that
// isn't there any more has ended.
import type { Job } from '../../types/jobs'

// agents and Ask all (hpchub-ask-<job>-<time>); not plain terminals, named hpchub-term-<date>-<time>
const AGENT_TAB = /^hpchub-(?!term-)[a-z0-9]+-(\d+)-[0-9a-z]+$/

/** The job id in an agent tab's tmux name; '' for other tabs. */
export function jobOfSession(session: string): string {
  return AGENT_TAB.exec(session)?.[1] ?? ''
}

export type NodeJob = {
  id: string
  state: 'running' | 'waiting' | 'ended' | 'unknown'  // unknown: your jobs aren't read yet
  left: number | null  // seconds before its time limit, while it runs
}

const ended = (id: string): NodeJob => ({ id, state: 'ended', left: null })

function of(j: Job): NodeJob {
  if (j.state === 'PENDING') return { id: j.job_id, state: 'waiting', left: null }
  if (j.state === 'RUNNING' || j.state === 'COMPLETING' || j.state === 'SUSPENDED') {
    return { id: j.job_id, state: 'running', left: j.limit_seconds ? Math.max(0, j.limit_seconds - j.seconds) : null }
  }
  return ended(j.job_id)
}

/** The job behind a terminal: named by its tab, else your running job on its node. null: none (the login node). */
export function nodeJob(session: string, node: string, jobs: Job[] | null): NodeJob | null {
  const id = jobOfSession(session)
  if (id) {
    if (jobs === null) return { id, state: 'unknown', left: null }
    const j = jobs.find((x) => x.job_id === id)
    return j ? of(j) : ended(id)
  }
  if (!node || jobs === null) return null
  const here = jobs.filter((x) => x.state === 'RUNNING' && x.where.split(',').map((n) => n.trim()).includes(node))
  return here.length ? of(here[0]) : null
}

/** "job 1621596", then how it stands. */
export function jobText(j: NodeJob, time: (seconds: number) => string): string {
  if (j.state === 'ended') return `job ${j.id} ended`
  if (j.state === 'waiting') return `job ${j.id} waiting`
  if (j.state === 'running' && j.left !== null) return `job ${j.id} · ${time(j.left)} left`
  return `job ${j.id}`
}

export function jobTip(j: NodeJob, node: string, time: (seconds: number) => string): string {
  const on = node ? ` on ${node}` : ''
  if (j.state === 'ended') {
    return `Slurm job ${j.id} has ended: it is no longer in your jobs, and what ran in it stopped with it.`
  }
  if (j.state === 'waiting') return `Slurm job ${j.id} is waiting in the queue.`
  if (j.state === 'running') {
    return `Slurm job ${j.id}${on} is running${j.left !== null ? `, ${time(j.left)} before its time limit` : ''}.`
  }
  return `Slurm job ${j.id}${on}`
}
