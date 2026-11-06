import { Copy, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useGo } from '../../nav'
import { call } from '../../rpc'
import type { Job, JobDetails } from '../../types/jobs'
import { EDialog } from '../e/EDialog'
import { Row } from '../e/Row'
import { Section } from '../e/Section'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { Meter } from '../ui/Meter'
import { Spinner } from '../ui/Spinner'
import { StatusPill } from '../ui/StatusPill'
import { useToast } from '../useToast'
import { detailGroups } from './details'
import { reasonText, stateName, timeShare } from './format'

export function DetailsDialog({ cluster, job: j, onClose, onCancel }:
  { cluster: string; job: Job; onClose: () => void; onCancel: () => void }) {
  const toast = useToast()
  const go = useGo()
  const [details, setDetails] = useState<JobDetails | null>(null)
  const [error, setError] = useState('')
  const [all, setAll] = useState(false)
  useEffect(() => {
    call<JobDetails>('jobs.details', { cluster, job_id: j.job_id })
      .then(setDetails)
      .catch((e: Error) => setError(e.message))
  }, [cluster, j.job_id])

  const groups = detailGroups(details?.groups ?? [], j)
  const copy = (v: string) => navigator.clipboard.writeText(v).then(() => toast('Path copied'), () => {})
  // the output file in the Code page, to read; while the job runs it follows the file as it grows
  const view = (path: string) => {
    onClose()
    go('code', { cluster, path, readonly: '1', ...(/running/i.test(j.state) ? { follow: '1' } : {}) })
  }

  return (
    <EDialog title={j.name || `Job ${j.job_id}`} onClose={onClose} width={600}
      actions={j.cancellable && <Button kind="danger-solid" size="lg" className="ml-auto" onClick={onCancel}>
        Cancel job</Button>}>
      <div className="flex flex-col gap-2 px-5">
        <StatusPill state={j.state}>{stateName(j.state)}</StatusPill>
        {j.reason ? <p className="text-dim">{reasonText(j.reason)}</p>
          : j.state !== 'PENDING' && <div className="flex flex-col gap-1.5">
            <span className="tabular-nums">{[j.elapsed_text, j.limit_text && `of ${j.limit_text}`]
              .filter(Boolean).join(' ')}</span>
            {j.limit_seconds > 0 && <Meter value={timeShare(j)} label="Time used" />}
          </div>}
      </div>
      {groups.filter((g) => g.rows.length).map((g) => (
        <Section key={g.title || 'job'} title={g.title || undefined}>
          {g.rows.map((r) => g.title === 'Files'
            ? <Row key={r.label} label={r.label}
                sub={<span className="font-mono break-all select-text" title={r.value}>{r.value}</span>}>
                {r.label !== 'Work folder' && <Button size="sm" onClick={() => view(r.value)}>
                  <FileText size={14} className="text-dim" /> View</Button>}
                <IconButton icon={Copy} label="Copy path" small onClick={() => copy(r.value)} />
              </Row>
            : <Row key={r.label} label={r.label} value={<span className="font-normal select-text">{r.value}</span>} />)}
        </Section>
      ))}
      {error && <p className="px-5 py-3 text-bad">{error}</p>}
      {!details && !error && <div className="grid h-32 place-items-center"><Spinner size={24} /></div>}
      {details && <Section>
        <Row label="All fields" value={<span className="font-normal text-dim">{all ? 'Hide' : 'Show'}</span>}
          onPress={() => setAll(!all)} />
        {all && <pre className="mx-5 my-3 rounded-lg bg-soft p-3 font-mono text-xs break-all whitespace-pre-wrap
          select-text">{details.text}</pre>}
      </Section>}
    </EDialog>
  )
}
