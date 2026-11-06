import { EllipsisVertical, FileText, Pencil, Play, Trash2 } from 'lucide-react'

import type { ScheduleStatus } from '../../types/schedules'
import { ItemRow, StatusDot, Switch } from '../e/extra'
import { Menu } from '../projects/Menu'
import { Spinner } from '../ui'
import { computeText, localWhen, status } from './format'

/** The backup agent's weekly check: shown by what it does, edited on the Backup agent page. */
export const isBackupCheck = (st: ScheduleStatus) => st.runner === 'backup' || st.name === 'backup-check'

export function ScheduleRow({ st, busy, onToggle, onRun, onLog, onEdit, onDelete }: {
  st: ScheduleStatus; busy: boolean; onToggle: (on: boolean) => void; onRun: () => void; onLog: () => void
  onEdit: () => void; onDelete: () => void
}) {
  const s = status(st)
  const backup = isBackupCheck(st)
  const where = st.folder.replace(/\/+$/, '') === '~' ? 'Home folder' : st.folder
  const what = backup ? ['Backup agent', 'scratch', st.when] : [st.agent_name, where, st.when]
  const how = [s.kind === 'ok' ? '' : s.note, st.last_run ? `Last run ${localWhen(st.last_run)}` : 'Not run yet',
    computeText(st.compute)].filter(Boolean)
  return (
    <ItemRow title={st.task} onPress={onEdit}
      label={<span className="font-medium">{backup ? 'Weekly scratch check' : st.name}</span>}
      sub={<>
        <span className="flex items-center gap-1.5">
          <StatusDot tone={s.kind === 'ok' ? 'busy' : s.kind === 'warn' ? 'error' : st.enabled ? 'on' : 'off'} />
          {[s.label, ...what].join(' · ')}</span>
        <span className="block">{how.join(' · ')}</span>
      </>}
      trailing={<>
        {busy ? <span className="grid size-10 place-items-center"><Spinner /></span>
          : <span className="grid h-10 w-12 place-items-center">
              <Switch checked={st.enabled} onChange={onToggle}
                label={st.enabled ? `${st.name} is on` : `${st.name} is paused`} /></span>}
        <Menu label={`Actions for ${st.name}`} trigger={<EllipsisVertical size={18} />}
          className="grid size-9 place-items-center rounded-md text-dim hover:bg-hover" groups={[[
            { label: 'Run once now', icon: Play, onClick: onRun },
            { label: 'Last answer', icon: FileText, onClick: onLog },
            { label: backup ? 'Change in Backup' : 'Edit', icon: Pencil, onClick: onEdit },
          ], [{ label: 'Delete', icon: Trash2, danger: true, onClick: onDelete }]]} />
      </>} />
  )
}
