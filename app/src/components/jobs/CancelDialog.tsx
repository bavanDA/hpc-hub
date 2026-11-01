// Cancel a job: one short question that says what you lose (time run, what runs in it, HPC Hub's node).
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
    toast(`Cancelling job ${j.job_id}…`)
    call<{ gone: boolean }>('jobs.cancel', { cluster, job_id: j.job_id })
      .then(({ gone }) => toast(gone ? `Job ${j.job_id} is cancelled`
        : `Cancel sent. Slurm is still stopping job ${j.job_id}`))
      .catch((e: Error) => toast(`Couldn't cancel job ${j.job_id}: ${e.message}`))
      .finally(onDone)
  }

  return (
    <AlertDialog title={`Cancel ${j.name || `job ${j.job_id}`}?`} keep={running ? 'Keep running' : 'Keep waiting'}
      act="Cancel job" disabled={!inside} onAct={confirm} onClose={onClose}>
      <p>{running
        ? `It has run ${ranFor(j.elapsed)}. Its output so far stays in your folder.`
        : "It's still waiting in the queue. Nothing has started yet."}</p>
      {inside && inside.sessions.length > 0 && <p>These stop too: {inside.sessions.join(', ')}.</p>}
      {appNode && <p>HPC Hub runs your terminals on this node, so you'll be left without one.</p>}
      {!inside && <p className="flex items-center gap-2 text-[13px]"><Spinner size={14} />Checking what runs in it…</p>}
    </AlertDialog>
  )
}
