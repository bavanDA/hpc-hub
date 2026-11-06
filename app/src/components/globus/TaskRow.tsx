import { ExternalLink, X } from 'lucide-react'

import type { Task } from '../../types/globus'
import { openSystem } from '../app/openLink'
import { size } from '../files/format'
import { IconButton } from '../ui/IconButton'
import { Pill } from '../ui/Pill'
import { Row } from '../ui/Row'
import { shortDate } from './format'
import { TaskIcon } from './TaskIcon'
import { TaskProgress } from './TaskProgress'
import { reason, state } from './taskState'

export function TaskRow({ t, onCancel, names }:
  { t: Task; onCancel: (id: string) => void; names: Record<string, string> }) {
  const [label, kind] = state(t)
  const files = !t.files ? 'Counting files' : t.files_done === t.files ? `${t.files} file${t.files === 1 ? '' : 's'}`
    : `${t.files_done} of ${t.files} files`
  const rate = t.active && t.rate ? ` · ${size(t.rate)}/s` : ''
  const failed = t.status === 'FAILED' && !t.cancelled
  return (
    <Row prefix={<TaskIcon t={t} />}
      title={<span className="font-medium">{t.label.replace(/^HPC Hub /, '')}</span>}
      subtitle={<>
        <span>{names[t.source] ?? t.source} → {names[t.destination] ?? t.destination}</span>
        <span className="block">{failed ? `Failed: ${reason(t)}`
          : <>{size(t.bytes)} · {files}{rate} · {shortDate(t.request_time)}</>}</span>
        {t.active && <TaskProgress t={t} />}
      </>}
      suffix={<div className="flex items-center gap-1">
        <Pill kind={kind}>{label}</Pill>
        {t.active && <IconButton icon={X} label="Cancel transfer" size={16} onClick={() => onCancel(t.task_id)} />}
        {failed && <IconButton icon={ExternalLink} label="Open in Globus" size={16}
          onClick={() => openSystem(`https://app.globus.org/activity/${t.task_id}`)} />}
      </div>} />
  )
}
