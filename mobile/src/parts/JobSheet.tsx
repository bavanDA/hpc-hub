// One job: its state and time once at the top, then Slurm's details as rows in plain words (with its SU), the output
// and error files (a tap opens them in Code, read-only), and every field under "All fields". Cancel asks first
// (CancelSheet); HPC Hub's own node is released instead.
import { Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Job, JobDetails } from '@shared/types/jobs'
import { Button, Row, Section, Sheet, useToast } from '../ui'
import { CancelSheet } from './CancelSheet'
import { reasonText } from './jobs/filters'
import { JobState, JobTime } from './jobs/JobRow'
import { phoneGroups } from './jobs/words'

/** A file of the job: a tap opens it (or nothing, for the folder), the copy button copies its path. */
function FileRow({ label, path, onView, onCopy }:
  { label: string; path: string; onView?: () => void; onCopy: () => void }) {
  const text = (
    <span className="min-w-0 flex-1">
      <span className="block">{label}</span>
      <span className="block font-mono text-sm break-all text-dim select-text">{path}</span>
    </span>
  )
  return (
    <div className="flex min-h-14 items-center border-b border-line pr-1">
      {onView
        ? <button onClick={onView} className="flex min-h-14 min-w-0 flex-1 items-center py-2 pl-4 text-left
            active:bg-pressed">{text}</button>
        : <div className="flex min-h-14 min-w-0 flex-1 items-center py-2 pl-4">{text}</div>}
      <button aria-label={`Copy the path of ${label.toLowerCase()}`} onClick={onCopy}
        className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed"><Copy size={20} />
      </button>
    </div>
  )
}

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

  const appNode = !!appJob && appJob === j.job_id
  const found = phoneGroups(details?.groups ?? []).map((g) => g.title === 'Resources' && j.su
    ? { ...g, rows: [...g.rows, { label: 'Hours (SU)', value: j.su }] } : g)
  // the job's id leads the first group (the times), or stands alone while the details load
  const id = { label: 'Job ID', value: j.job_id }
  const groups = found[0]?.title === '' ? [{ ...found[0], rows: [id, ...found[0].rows] }, ...found.slice(1)]
    : [{ title: '', rows: [id] }, ...found]
  const copy = async (path: string) => toast(await copyText(path) ? 'Path copied' : "Couldn't copy the path")
  const view = (path: string) => {
    onClose()
    go('code', { cluster, path, readonly: '1' })
  }

  return (
    <Sheet title={j.name || `Job ${j.job_id}`} onClose={onClose} flush actions={j.cancellable
      ? <Button kind="danger" className="h-[52px] flex-1 text-base" onClick={() => setCancelling(true)}>
          {appNode ? 'Release node' : 'Cancel job'}</Button> : undefined}>
      <div className="flex flex-col gap-2 px-4">
        <JobState state={j.state} />
        {j.reason ? <p className="text-dim">{reasonText(j.reason)}</p> : <JobTime job={j} />}
      </div>
      {groups.map((g) => g.title === 'Files'
        ? <Section key={g.title} title="Files">
            {g.rows.map((r) => <FileRow key={r.label} label={r.label} path={r.value} onCopy={() => copy(r.value)}
              onView={r.label === 'Work folder' ? undefined : () => view(r.value)} />)}
          </Section>
        : <Section key={g.title || 'times'} title={g.title || undefined}>
            {g.rows.map((r) => <Row key={r.label} label={r.label}
              value={<span className="select-text">{r.value}</span>} />)}
          </Section>)}
      {error && <p className="px-4 py-3 text-bad">{error}</p>}
      {!details && !error && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
      {details && <Section>
        <Row label="All fields" value={<span className="font-normal text-dim">{all ? 'Hide' : 'Show'}</span>}
          onPress={() => setAll(!all)} />
        {all && <pre className="m-4 rounded-lg bg-soft p-3 font-mono text-xs break-all whitespace-pre-wrap
          select-text">{details.text}</pre>}
      </Section>}
      <div className="h-4" />
      {cancelling && <CancelSheet cluster={cluster} job={j} appNode={appNode} onClose={() => setCancelling(false)}
        onDone={() => { onChanged(); onClose() }} />}
    </Sheet>
  )
}
