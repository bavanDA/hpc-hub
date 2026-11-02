// Cancel a job: one short question that says what you lose (time run, what runs in it). HPC Hub's own node gets
// the Release node question instead.
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Inside, Job } from '../../types/jobs'
import { AlertDialog, Spinner } from '../ui'
import { useToast } from '../toast'

/** "3 h 41 min" for Slurm's "3:41:10", "1 d 2 h" for "1-02:00:00", "12 min" for "12:30". */
export function ranFor(t: string): string {
  const [d, hms] = t.includes('-') ? t.split('-') : ['0', t]
  const p = hms.split(':').map((x) => Number(x) || 0)
  const [h, m] = p.length === 3 ? [p[0], p[1]] : [0, p[0]]
  const days = Number(d) || 0
  return days ? `${days} d${h ? ` ${h} h` : ''}` : h ? `${h} h${m ? ` ${m} min` : ''}` : `${m || 1} min`
}

export function CancelDialog({ cluster, job: j, appJob, onClose, onDone }: {
  cluster: string; job: Job; appJob: string; onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  const [inside, setInside] = useState<Inside | null>(null)
  useEffect(() => {
    call<Inside>('jobs.inside', { cluster, job_id: j.job_id })
      .then(setInside)
      .catch(() => setInside({ sessions: [], app_node: false }))
  }, [cluster, j.job_id])

  const running = j.state === 'RUNNING'
  const appNode = inside?.app_node || appJob === j.job_id

  const confirm = () => {
    onClose()
    toast(appNode && running ? `Releasing node ${j.where}…` : `Cancelling job ${j.job_id}…`)
    call<{ gone: boolean }>('jobs.cancel', { cluster, job_id: j.job_id })
      .then(({ gone }) => toast(gone ? `Job ${j.job_id} is cancelled`
        : `Cancel sent. Job ${j.job_id} is still stopping`))
      .catch((e: Error) => toast(`Couldn't cancel job ${j.job_id}: ${e.message}`))
      .finally(onDone)
  }

  // HPC Hub's own node: the same question as the card's Release node
  if (appNode && running) return (
    <AlertDialog title={`Release node ${j.where}?`} keep="Keep it" act="Release node" onAct={confirm}
      onClose={onClose}>
      <p>Anything running on it stops.</p>
      {inside && inside.sessions.length > 0 && <p>These stop too: {inside.sessions.join(', ')}.</p>}
    </AlertDialog>
  )
  return (
    <AlertDialog title={`Cancel ${j.name || `job ${j.job_id}`}?`} keep={running ? 'Keep running' : 'Keep waiting'}
      act="Cancel job" disabled={!inside} onAct={confirm} onClose={onClose}>
      <p>{running
        ? `It has run ${ranFor(j.elapsed)}. Its output so far stays in your folder.`
        : "It's still waiting in the queue. Nothing has started yet."}</p>
      {inside && inside.sessions.length > 0 && <p>These stop too: {inside.sessions.join(', ')}.</p>}
      {appNode && <p>Your terminals on this node stop too.</p>}
      {!inside && <p className="flex items-center gap-2 text-sm"><Spinner size={14} />Checking what runs in it…</p>}
    </AlertDialog>
  )
}

/** Cancel several of your jobs at once: one question naming them, then one scancel each. */
export function CancelManyDialog({ cluster, jobs, appJob, onClose, onDone }: {
  cluster: string; jobs: Job[]; appJob: string; onClose: () => void; onDone: () => void
}) {
  const toast = useToast()
  const n = jobs.length
  const names = jobs.map((j) => j.name || `job ${j.job_id}`)
  const node = jobs.find((j) => j.job_id === appJob && j.state === 'RUNNING')
  const confirm = () => {
    onClose()
    toast(`Cancelling ${n} jobs…`)
    Promise.allSettled(jobs.map((j) => call('jobs.cancel', { cluster, job_id: j.job_id })))
      .then((all) => {
        const failed = all.filter((r) => r.status === 'rejected').length
        toast(failed ? `${n - failed} of ${n} jobs cancelled. ${failed} could not be cancelled` : `${n} jobs cancelled`)
      })
      .finally(onDone)
  }
  return (
    <AlertDialog title={`Cancel ${n} jobs?`} keep="Keep them" act={`Cancel ${n} jobs`} onAct={confirm}
      onClose={onClose}>
      <p>{names.length > 6 ? `${names.slice(0, 6).join(', ')} and ${names.length - 6} more.` : `${names.join(', ')}.`}</p>
      <p>Running ones stop now. Their output so far stays in your folders.</p>
      {node && <p>One of them is HPC Hub&apos;s node {node.where}. Your terminals on it stop too.</p>}
    </AlertDialog>
  )
}
