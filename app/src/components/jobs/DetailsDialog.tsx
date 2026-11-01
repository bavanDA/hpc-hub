// Job details: the fields people look at, grouped, and all of them behind "All fields".
import { ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { DetailGroup, Job, JobDetails } from '../../types/jobs'
import { useToast } from '../toast'
import { Button, Dialog, IconButton, List, Row, Spinner } from '../ui'

export function DetailsDialog({ cluster, job: j, onClose, onCancel }:
  { cluster: string; job: Job; onClose: () => void; onCancel: () => void }) {
  const toast = useToast()
  const [details, setDetails] = useState<JobDetails | null>(null)
  const [error, setError] = useState('')
  const [all, setAll] = useState(false)
  useEffect(() => {
    call<JobDetails>('jobs.details', { cluster, job_id: j.job_id })
      .then(setDetails)
      .catch((e: Error) => setError(e.message))
  }, [cluster, j.job_id])

  const groups: DetailGroup[] = (details?.groups ?? []).map((g) => g.title === 'Resources' && j.su
    ? { ...g, rows: [...g.rows, { label: 'SU', value: j.su }] } : g)
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast('Path copied'), () => {})

  return (
    <Dialog title={`Job ${j.job_id} · ${j.name}`} onClose={onClose} width={600}
      actions={j.cancellable && <Button kind="destructive" onClick={onCancel}>Cancel job</Button>}>
      {error && <p className="py-6 text-center text-bad">{error}</p>}
      {!details && !error && <p className="flex items-center justify-center gap-2 py-10 text-dim">
        <Spinner />Loading…</p>}
      <div className="flex flex-col gap-5 pb-2">
        {groups.filter((g) => g.rows.length).map((g) => (
          <section key={g.title} className="flex flex-col gap-2">
            <h3 className="font-semibold">{g.title}</h3>
            <List>
              {g.rows.map((r) => g.title === 'Files'
                ? <Row key={r.label} title={<span className="text-sm text-dim">{r.label}</span>}
                    subtitle={<span className="font-mono text-sm text-text select-text" title={r.value}>
                      {r.value}</span>}
                    suffix={<IconButton icon={Copy} label="Copy path" size={16} onClick={() => copy(r.value)} />} />
                : <div key={r.label} className="flex min-h-11 items-center gap-4 px-4 py-2">
                    <span className="flex-1">{r.label}</span>
                    <span className="text-right text-dim select-text">{r.value}</span>
                  </div>)}
            </List>
          </section>
        ))}
        {details && (
          <section>
            <button onClick={() => setAll(!all)} className="flex items-center gap-1 font-semibold">
              {all ? <ChevronDown size={16} /> : <ChevronRight size={16} />} All fields
            </button>
            {all && <pre className="mt-2 rounded-md bg-view p-3 font-mono text-xs break-all whitespace-pre-wrap
              select-text">{details.text}</pre>}
          </section>
        )}
      </div>
    </Dialog>
  )
}
