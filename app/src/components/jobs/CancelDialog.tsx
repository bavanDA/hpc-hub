// Cancel a job, after saying exactly what stops: node, time used, terminals and agents in it, HPC Hub's node.
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Inside, Job } from '../../types/jobs'
import { Button, Dialog, Spinner } from '../ui'
import { useToast } from '../toast'

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
  const lines = [
    `${j.name} · ${j.partition}`,
    running ? `Node: ${j.where}` : `Waiting: ${j.where}`,
    running && `Running for ${j.elapsed} of ${j.limit}`,
    inside?.sessions.length && `Running in it: ${inside.sessions.join(', ')}`,
    appNode && 'HPC Hub is using this node.',
  ].filter(Boolean)

  const confirm = () => {
    onClose()
    toast(`Cancelling job ${j.job_id}…`)
    call<{ gone: boolean }>('jobs.cancel', { cluster, job_id: j.job_id })
      .then(({ gone }) => toast(gone ? `Job ${j.job_id} is cancelled and gone from the queue`
        : `Cancel sent. Slurm is still stopping job ${j.job_id}`))
      .catch((e: Error) => toast(`Could not cancel job ${j.job_id}: ${e.message}`))
      .finally(onDone)
  }

  return (
    <Dialog title={`Cancel job ${j.job_id}?`} onClose={onClose} width={440} actions={<>
      <Button autoFocus onClick={onClose}>{running ? 'Keep running' : 'Keep waiting'}</Button>
      <Button kind="destructive" disabled={!inside} onClick={confirm}>Cancel job</Button>
    </>}>
      <div className="flex flex-col gap-1 text-center">
        {lines.map((l) => <p key={String(l)}>{l}</p>)}
        {!inside && <p className="flex items-center justify-center gap-2 text-dim"><Spinner size={14} />
          Checking what runs in it…</p>}
        <p className="mt-3 font-bold">{running
          ? "Everything running in this job stops right away and can't be brought back."
          : 'It leaves the queue. Nothing has started yet.'}</p>
      </div>
    </Dialog>
  )
}
