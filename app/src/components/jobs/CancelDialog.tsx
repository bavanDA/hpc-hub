import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Inside, Job } from '../../types/jobs'
import { useToast } from '../toast'
import { AlertDialog, Spinner } from '../ui'
import { ranFor } from './format'

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
