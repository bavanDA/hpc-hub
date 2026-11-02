// One Globus transfer: where it goes, how far, and Stop while it runs (or Open in Globus when it failed).
import { CircleCheck, CircleX, ExternalLink, Loader2, Pause, X } from 'lucide-react'

import { openSystem } from '@shared/components/app/openLink'
import { formatSize, shortDate } from '@shared/components/globus/parts'
import type { Task } from '@shared/types/globus'

const words = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())

function Icon({ t }: { t: Task }) {
  if (t.status === 'SUCCEEDED') return <CircleCheck size={22} className="text-dim" />
  if (t.status === 'FAILED') return <CircleX size={22} className={t.cancelled ? 'text-dim' : 'text-bad'} />
  if (t.status === 'INACTIVE') return <Pause size={22} className="text-dim" />
  return <Loader2 size={22} className="animate-spin text-dim" />
}

export function TaskRow({ t, names, onCancel }:
  { t: Task; names: Record<string, string>; onCancel: (t: Task) => void }) {
  const failed = t.status === 'FAILED' && !t.cancelled
  const files = !t.files ? 'Counting files' : t.files_done === t.files ? `${t.files} file${t.files === 1 ? '' : 's'}`
    : `${t.files_done} of ${t.files} files`
  const rate = t.active && t.rate ? ` · ${formatSize(t.rate)}/s` : ''
  const line = failed ? `Failed: ${words(t.problem || t.nice_status || 'Globus did not say why')}`
    : t.status === 'FAILED' ? 'Stopped'
      : `${formatSize(t.bytes)} · ${files}${rate}${t.problem ? ` · ${words(t.problem)}` : ''}`
  const part = t.files ? Math.min(1, t.files_done / t.files) : 0
  return (
    <div className="flex items-start gap-3 border-b border-line py-3 pl-4">
      <span className="mt-0.5 shrink-0"><Icon t={t} /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold break-all">{t.label.replace(/^HPC Hub /, '')}</p>
        <p className="text-sm text-dim">
          {names[t.source] ?? t.source} to {names[t.destination] ?? t.destination}</p>
        {t.active && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft">
            {t.files ? <div className="h-full rounded-full bg-text" style={{ width: `${part * 100}%` }} />
              : <div className="h-full w-1/3 animate-pulse rounded-full bg-dim" />}
          </div>
        )}
        <p className={`mt-1 text-sm ${failed ? 'text-bad' : 'text-dim'}`}>{line} · {shortDate(t.request_time)}</p>
      </div>
      {t.active && <button aria-label="Stop copy" onClick={() => onCancel(t)}
        className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed"><X size={20} /></button>}
      {failed && <button aria-label="Open in Globus" onClick={() => openSystem(`https://app.globus.org/activity/${t.task_id}`)}
        className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed">
        <ExternalLink size={20} /></button>}
    </div>
  )
}
