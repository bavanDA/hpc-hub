import { ArrowLeft, ArrowRight, Settings } from 'lucide-react'

import { call } from '../../rpc'
import type { GlobusCluster, GlobusStatus, Task } from '../../types/globus'
import { shortName } from '../clusters/loginCopy'
import { join } from '../files/format'
import { useToast } from '../toast'
import { Button, IconButton } from '../ui'
import { Pane } from './Pane'
import { Transfers } from './Transfers'
import type { Pane as PaneState } from './usePane'

export function Board({ status, left, right, tasks, tasksError, loadTasks, check, onSettings, onChoose, onConsent }: {
  status: GlobusStatus; left: PaneState; right: PaneState; tasks: Task[] | null; tasksError: string
  loadTasks: () => void; check: () => void; onSettings: () => void; onChoose: (c: GlobusCluster) => void
  onConsent: () => void
}) {
  const toast = useToast()

  const transfer = (src: PaneState, dst: PaneState) => {
    const it = src.selected
    if (!it) return
    if (!dst.path) { toast('Open a folder on the other side first'); return }
    call('globus.transfer', { src_cluster: src.cluster, src_path: join(src.path, it.name),
      dst_cluster: dst.cluster, dst_path: join(dst.path, it.name), recursive: it.is_dir })
      .then(() => { toast(`Sent ${it.name} to Globus`); loadTasks() })
      .catch((e: Error) => { toast(`Transfer failed: ${e.message}`); check() })
  }

  const cancel = (id: string) => call('globus.cancel', { task_id: id })
    .then(() => toast('Transfer cancelled')).catch((e: Error) => toast(`Cancel failed: ${e.message}`))
    .finally(loadTasks)

  const startPersonal = async (c: GlobusCluster) => {
    toast(`Starting Globus Connect on ${c.name}…`)
    try {
      await call('globus.start_personal', { cluster: c.id })
      toast(`Globus Connect is running on ${c.name}`)
    } catch (e) {
      toast(`Could not start Globus Connect: ${(e as Error).message}`)
    }
  }

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-3 px-4 py-4 [color-scheme:light_dark]">
      <div className="flex items-center gap-2 pl-1">
        <p className="flex-1 text-sm text-dim">You can close the app or your laptop while files copy.</p>
        <IconButton icon={Settings} label="Globus settings" size={16} onClick={onSettings} />
      </div>
      <div className="flex min-h-[340px] flex-1 gap-3">
        <Pane pane={left} clusters={status.clusters} onChoose={onChoose} onStart={startPersonal}
          onConsent={onConsent} />
        <div className="flex shrink-0 flex-col items-center justify-center gap-2">
          <Button kind={left.selected ? 'primary' : 'secondary'} disabled={!left.selected} title="Send the selected item"
            onClick={() => transfer(left, right)}>Transfer<ArrowRight size={16} /></Button>
          <Button kind={right.selected ? 'primary' : 'secondary'} disabled={!right.selected}
            title="Send the selected item" onClick={() => transfer(right, left)}><ArrowLeft size={16} />Transfer</Button>
        </div>
        <Pane pane={right} clusters={status.clusters} onChoose={onChoose} onStart={startPersonal}
          onConsent={onConsent} />
      </div>
      <Transfers tasks={tasks} error={tasksError} onRefresh={loadTasks} onCancel={cancel}
        names={Object.fromEntries(status.clusters.filter((c) => c.collection_name)
          .map((c) => [c.collection_name, shortName(c)]))} />
    </div>
  )
}
