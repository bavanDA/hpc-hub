// Recent transfers: where each is at, with a progress bar and Cancel while it runs.
import { CircleCheck, CircleX, Loader2, Pause, RefreshCw, X } from 'lucide-react'

import type { Task } from '../../types/globus'
import { IconButton, List, Pill, Row } from '../ui'
import { formatSize, shortDate } from './parts'

function state(t: Task): [string, 'ok' | 'bad' | 'warn' | 'dim'] {
  if (t.status === 'SUCCEEDED') return ['Done', 'ok']
  if (t.status === 'FAILED') return [t.cancelled ? 'Cancelled' : 'Failed', t.cancelled ? 'dim' : 'bad']
  if (t.problem) return [t.problem.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()), 'warn']
  if (t.status === 'INACTIVE') return ['Paused', 'warn']
  return ['Running', 'dim']
}

function Icon({ t }: { t: Task }) {
  if (t.status === 'SUCCEEDED') return <CircleCheck size={20} className="shrink-0 text-ok" />
  if (t.status === 'FAILED') return <CircleX size={20} className={`shrink-0 ${t.cancelled ? 'text-dim' : 'text-bad'}`} />
  if (t.status === 'INACTIVE') return <Pause size={20} className="shrink-0 text-warn" />
  return <Loader2 size={20} className="shrink-0 animate-spin text-accent-text" />
}

function Progress({ t }: { t: Task }) {
  const part = t.files ? Math.min(1, t.files_done / t.files) : 0
  return (
    <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-pill">
      {t.files ? <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${part * 100}%` }} />
        : <div className="h-full w-1/3 animate-pulse rounded-full bg-accent/60" />}
    </div>
  )
}

function TaskRow({ t, onCancel }: { t: Task; onCancel: (id: string) => void }) {
  const [label, kind] = state(t)
  const files = t.files ? `${t.files_done} of ${t.files} files` : 'Counting files'
  const rate = t.active && t.rate ? ` · ${formatSize(t.rate)}/s` : ''
  return (
    <Row prefix={<Icon t={t} />}
      title={<span className="font-bold">{t.label}</span>}
      subtitle={<>
        <span>{t.source} → {t.destination}</span>
        <span className="block">{formatSize(t.bytes)} · {files}{rate} · {shortDate(t.request_time)}</span>
        {t.active && <Progress t={t} />}
      </>}
      suffix={<div className="flex items-center gap-1">
        <Pill kind={kind}>{label}</Pill>
        {t.active && <IconButton icon={X} label="Cancel transfer" size={16} onClick={() => onCancel(t.task_id)} />}
      </div>} />
  )
}

export function Transfers({ tasks, error, onRefresh, onCancel }:
  { tasks: Task[] | null; error: string; onRefresh: () => void; onCancel: (id: string) => void }) {
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="flex-1 font-bold">Recent transfers</h2>
        <IconButton icon={RefreshCw} label="Refresh" size={16} onClick={onRefresh} />
      </div>
      <div className="max-h-[184px] min-h-0 overflow-auto rounded-xl">
        <List>
          {error ? <p className="p-4 text-center text-[13px] text-bad">{error}</p>
            : !tasks?.length ? <p className="p-4 text-center text-dim">{tasks ? 'No transfers yet' : 'Loading…'}</p>
            : tasks.map((t) => <TaskRow key={t.task_id} t={t} onCancel={onCancel} />)}
        </List>
      </div>
    </div>
  )
}
