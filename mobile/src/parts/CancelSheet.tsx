// Cancel a job: the desktop's one short question (what you lose: the time it ran, what runs in it, HPC Hub's node),
// from the bottom of the screen. Keep is the safe choice on the left.
import { useEffect, useState } from 'react'

import { ranFor } from '@shared/components/jobs/CancelDialog'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Inside, Job } from '@shared/types/jobs'
import { BottomSheet, Button, useToast } from '../ui'

export function CancelSheet({ cluster, job: j, appJob, onClose, onDone }: {
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
    <BottomSheet onClose={onClose}>
      <h2 className="px-1 text-lg font-bold">Cancel {j.name || `job ${j.job_id}`}?</h2>
      <div className="flex flex-col gap-2 px-1 pt-1 text-dim">
        <p>{running
          ? `It has run ${ranFor(j.elapsed)}. Its output so far stays in your folder.`
          : "It's still waiting in the queue. Nothing has started yet."}</p>
        {inside && inside.sessions.length > 0 && <p>These stop too: {inside.sessions.join(', ')}.</p>}
        {appNode && <p>HPC Hub runs your terminals on this node, so you'll be left without one.</p>}
        {!inside && <p className="flex items-center gap-2 text-sm"><Spinner size={14} />Checking what runs in it…</p>}
      </div>
      <div className="mt-4 flex gap-3">
        <Button className="flex-1" onClick={onClose}>{running ? 'Keep running' : 'Keep waiting'}</Button>
        <Button kind="danger" className="flex-1" disabled={!inside} onClick={confirm}>Cancel job</Button>
      </div>
    </BottomSheet>
  )
}
