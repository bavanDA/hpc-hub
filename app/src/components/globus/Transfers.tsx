import { RefreshCw } from 'lucide-react'

import type { Task } from '../../types/globus'
import { IconButton } from '../ui/IconButton'
import { List } from '../ui/List'
import { TaskRow } from './TaskRow'

export function Transfers({ tasks, error, onRefresh, onCancel, names = {} }:
  { tasks: Task[] | null; error: string; onRefresh: () => void; onCancel: (id: string) => void
    names?: Record<string, string> }) {  // names: Globus collection name -> the app's cluster name
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <h2 className="flex-1 text-xs font-semibold tracking-wide text-dim uppercase">Recent transfers</h2>
        <IconButton icon={RefreshCw} label="Refresh" size={16} small onClick={onRefresh} />
      </div>
      <div className="max-h-[168px] min-h-0 overflow-auto">
        <List>
          {error ? <p className="p-4 text-center text-sm text-bad">{error}</p>
            : !tasks?.length ? <p className="p-4 text-center text-dim">{tasks ? 'No transfers yet' : 'Loading…'}</p>
            : tasks.map((t) => <TaskRow key={t.task_id} t={t} onCancel={onCancel} names={names} />)}
        </List>
      </div>
    </div>
  )
}
