// One job: Slurm's details, grouped, and Cancel for your own running or waiting jobs.
import { useEffect, useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Job, JobDetails } from '@shared/types/jobs'
import { Button, Sheet, useToast } from '../ui'

export function JobSheet({ cluster, job, onClose, onCancelled }:
  { cluster: string; job: Job; onClose: () => void; onCancelled: () => void }) {
  const toast = useToast()
  const [details, setDetails] = useState<JobDetails | null>(null)
  const [sure, setSure] = useState(false)
  useEffect(() => {
    call<JobDetails>('jobs.details', { cluster, job_id: job.job_id }).then(setDetails)
      .catch((e: Error) => toast(e.message))
  }, [cluster, job.job_id, toast])

  async function cancel() {
    try {
      await call('jobs.cancel', { cluster, job_id: job.job_id })
      toast(`Job ${job.job_id} cancelled`)
      onCancelled()
      onClose()
    } catch (e) {
      toast((e as Error).message)
    }
  }

  return (
    <Sheet title={`${job.name} (${job.job_id})`} onClose={onClose} actions={job.cancellable ? (
      sure ? <>
        <Button className="flex-1" onClick={() => setSure(false)}>Keep it</Button>
        <Button kind="danger" className="flex-1" onClick={cancel}>Yes, cancel</Button></>
        : <Button kind="danger" className="flex-1" onClick={() => setSure(true)}>Cancel job</Button>) : undefined}>
      {!details && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
      {details?.groups.map((g) => (
        <section key={g.title} className="mb-4">
          <h2 className="mb-1 text-sm font-bold text-dim">{g.title}</h2>
          <div className="rounded-2xl bg-card shadow-[var(--shadow-card)]">
            {g.rows.map((r) => (
              <div key={r.label} className="flex gap-3 border-b border-line px-4 py-3 last:border-0">
                <span className="w-28 shrink-0 text-dim">{r.label}</span>
                <span className="min-w-0 flex-1 select-text break-words">{r.value}</span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </Sheet>
  )
}
