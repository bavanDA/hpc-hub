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

/** Why a transfer failed, in words: Globus' problem code, else its status line. */
const reason = (t: Task) =>
  (t.problem || t.nice_status || 'Globus gave no reason').replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())

function Icon({ t }: { t: Task }) {
  if (t.status === 'SUCCEEDED') return <CircleCheck size={20} className="shrink-0 text-ok" />
  if (t.status === 'FAILED') {
    return <CircleX size={20} className={`shrink-0 ${t.cancelled ? 'text-dim' : 'text-bad'}`} />
  }
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

function TaskRow({ t, onCancel, names }:
  { t: Task; onCancel: (id: string) => void; names: Record<string, string> }) {
  const [label, kind] = state(t)
  const files = !t.files ? 'Counting files' : t.files_done === t.files ? `${t.files} file${t.files === 1 ? '' : 's'}`
    : `${t.files_done} of ${t.files} files`
  const rate = t.active && t.rate ? ` · ${formatSize(t.rate)}/s` : ''
  const failed = t.status === 'FAILED' && !t.cancelled
  return (
    <Row prefix={<Icon t={t} />}
      title={<span className="font-bold">{t.label.replace(/^HPC Hub /, '')}</span>}
      subtitle={<>
        <span>{names[t.source] ?? t.source} → {names[t.destination] ?? t.destination}</span>
        <span className="block">{failed ? `Failed: ${reason(t)}`
          : <>{formatSize(t.bytes)} · {files}{rate} · {shortDate(t.request_time)}</>}</span>
        {t.active && <Progress t={t} />}
      </>}
      suffix={<div className="flex items-center gap-1">
        <Pill kind={kind}>{label}</Pill>
        {t.active && <IconButton icon={X} label="Cancel transfer" size={16} onClick={() => onCancel(t.task_id)} />}
      </div>} />
  )
}

export function Transfers({ tasks, error, onRefresh, onCancel, names = {} }:
  { tasks: Task[] | null; error: string; onRefresh: () => void; onCancel: (id: string) => void
    names?: Record<string, string> }) {  // names: Globus collection name -> the app's cluster name
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <h2 className="flex-1 font-bold">Recent transfers</h2>
        <IconButton icon={RefreshCw} label="Refresh" size={16} onClick={onRefresh} />
      </div>
      <div className="max-h-[168px] min-h-0 overflow-auto rounded-xl">
        <List>
          {error ? <p className="p-4 text-center text-[13px] text-bad">{error}</p>
            : !tasks?.length ? <p className="p-4 text-center text-dim">{tasks ? 'No transfers yet' : 'Loading…'}</p>
            : tasks.map((t) => <TaskRow key={t.task_id} t={t} onCancel={onCancel} names={names} />)}
        </List>
      </div>
    </div>
  )
}
