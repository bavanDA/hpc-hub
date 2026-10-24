// One scheduled agent: what runs where and when, its state, the on switch and its actions.
import { AlarmClock, FileText, Pencil, Play, Trash2 } from 'lucide-react'

import type { ScheduleStatus } from '../../types/schedules'
import { Switch } from '../permissions/controls'
import { IconButton, Pill, Spinner } from '../ui'
import { computeText, localWhen, status } from './format'

export function ScheduleRow({ st, busy, onToggle, onRun, onLog, onEdit, onDelete }: {
  st: ScheduleStatus; busy: boolean; onToggle: (on: boolean) => void; onRun: () => void; onLog: () => void
  onEdit: () => void; onDelete: () => void
}) {
  const s = status(st)
  const own = computeText(st.compute)
  const what = [st.agent_name, st.folder, st.when].join(' · ')
  const how = [s.note, st.last_run ? `Last run ${localWhen(st.last_run)}` : 'Not run yet', own].filter(Boolean)
  return (
    <div className="flex min-h-[64px] items-center gap-3 px-4 py-2.5">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full ${
        st.enabled ? 'bg-accent/15 text-accent-text' : 'bg-pill text-dim'}`}><AlarmClock size={18} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-bold">{st.name}</span>
          <Pill kind={s.kind}>{s.label}</Pill>
        </div>
        <div className="truncate text-[13px] text-dim" title={st.task}>{what}</div>
        <div className="truncate text-[13px] text-dim">{how.join(' · ')}</div>
      </div>
      {busy ? <Spinner /> : null}
      <Switch on={st.enabled} onChange={onToggle} label={st.enabled ? 'On: runs on schedule' : 'Paused'} />
      <div className="flex shrink-0">
        <IconButton icon={Play} label="Run once now" size={16} onClick={onRun} />
        <IconButton icon={FileText} label="Last answer" size={16} onClick={onLog} />
        <IconButton icon={Pencil} label="Edit" size={16} onClick={onEdit} />
        <IconButton icon={Trash2} label="Delete" size={16} onClick={onDelete} />
      </div>
    </div>
  )
}
