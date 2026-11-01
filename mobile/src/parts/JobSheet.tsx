// One job: its state and time, Slurm's details grouped (with its SU), the output and error files (View opens them in
// Code, read-only), and every field folded under "All fields". Cancel asks first (CancelSheet).
import { ChevronDown, ChevronRight, Copy, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'

import { stateName } from '@shared/components/jobs/format'
import { copyText } from '@shared/components/terminals/xterm'
import { Spinner, StatusPill } from '@shared/components/ui'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { DetailGroup, Job, JobDetails } from '@shared/types/jobs'
import { Button, Card, Sheet, useToast } from '../ui'
import { CancelSheet } from './CancelSheet'
import { JobTime } from './jobs/JobRow'

export function JobSheet({ cluster, job: j, appJob, onClose, onChanged }: {
  cluster: string; job: Job; appJob: string; onClose: () => void; onChanged: () => void
}) {
  const toast = useToast()
  const go = useGo()
  const [details, setDetails] = useState<JobDetails | null>(null)
  const [error, setError] = useState('')
  const [all, setAll] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  useEffect(() => {
    call<JobDetails>('jobs.details', { cluster, job_id: j.job_id }).then(setDetails)
      .catch((e: Error) => setError(e.message))
  }, [cluster, j.job_id])

  const groups: DetailGroup[] = (details?.groups ?? []).map((g) => g.title === 'Resources' && j.su
    ? { ...g, rows: [...g.rows, { label: 'SU', value: j.su }] } : g)
  const copy = async (path: string) => toast(await copyText(path) ? 'Path copied' : "Couldn't copy the path")
  const view = (path: string) => {
    onClose()
    go('code', { cluster, path, readonly: '1' })
  }

  return (
    <Sheet title={`Job ${j.job_id}`} onClose={onClose} actions={j.cancellable
      ? <Button kind="danger" className="flex-1" onClick={() => setCancelling(true)}>Cancel job</Button> : undefined}>
      <Card className="mb-5">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-lg font-semibold">{j.name || `Job ${j.job_id}`}</span>
          <StatusPill state={j.state}>{stateName(j.state)}</StatusPill>
        </div>
        <div className="mt-2">{j.reason ? <p className="text-dim">{j.reason}</p> : <JobTime job={j} />}</div>
      </Card>
      {error && <p className="rounded-xl bg-bad-bg p-3 text-bad">{error}</p>}
      {!details && !error && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
      {groups.filter((g) => g.rows.length).map((g) => (
        <section key={g.title} className="mb-5">
          <h2 className="mb-1 text-sm font-bold text-dim">{g.title}</h2>
          <div className="rounded-2xl bg-card shadow-[var(--shadow-card)]">
            {g.rows.map((r) => g.title === 'Files'
              ? <div key={r.label} className="border-b border-line px-4 py-3 last:border-0">
                  <p className="text-sm text-dim">{r.label}</p>
                  <p className="mt-0.5 font-mono text-sm break-all select-text">{r.value}</p>
                  <div className="mt-2 flex gap-2">
                    {r.label !== 'Work folder' && <Button icon={FileText} className="flex-1"
                      onClick={() => view(r.value)}>View {r.label === 'Errors' ? 'errors' : 'output'}</Button>}
                    <Button icon={Copy} className={r.label === 'Work folder' ? 'flex-1' : ''}
                      onClick={() => copy(r.value)}>Copy path</Button>
                  </div>
                </div>
              : <div key={r.label} className="flex gap-3 border-b border-line px-4 py-3 last:border-0">
                  <span className="w-28 shrink-0 text-dim">{r.label}</span>
                  <span className="min-w-0 flex-1 select-text break-words">{r.value}</span>
                </div>)}
          </div>
        </section>
      ))}
      {details && (
        <section>
          <button onClick={() => setAll(!all)} className="flex h-11 items-center gap-1 font-semibold">
            {all ? <ChevronDown size={18} /> : <ChevronRight size={18} />} All fields
          </button>
          {all && <pre className="mt-1 rounded-xl bg-pill p-3 font-mono text-xs break-all whitespace-pre-wrap
            select-text">{details.text}</pre>}
        </section>
      )}
      {cancelling && <CancelSheet cluster={cluster} job={j} appJob={appJob} onClose={() => setCancelling(false)}
        onDone={() => { onChanged(); onClose() }} />}
    </Sheet>
  )
}
