// Agents › Scheduled (experimental): an agent that runs a task by itself, like cleaning the code every night at
// 02:00. Each one is a Slurm job that waits for its time, so it runs with your phone off. The desktop's page.
import { AlarmClock, CircleAlert, EllipsisVertical, FileText, Pencil, Play, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { useActiveCluster } from '@shared/components/clusters/active'
import { NotConnected } from '@shared/components/clusters/NotConnected'
import { Switch } from '@shared/components/e/Switch'
import { computeText, isBackupCheck, localWhen, status } from '@shared/components/schedules/format'
import { LogDialog } from '@shared/components/schedules/LogDialog'
import { useSchedules } from '@shared/components/schedules/useSchedules'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo } from '@shared/nav'
import { call } from '@shared/rpc'
import type { ScheduleStatus } from '@shared/types/schedules'
import { BackLayer, Button, ConfirmDialog, EmptyState, IconBtn, ItemRow, List, Menu, PageBar, StatusDot, useToast } from '../../ui'
import { ScheduleDialog } from './ScheduleDialog'

type Open = { kind: 'edit'; st: ScheduleStatus | null } | { kind: 'log' | 'delete'; st: ScheduleStatus }

export function Scheduled() {
  const toast = useToast()
  const { cluster: active, session, connected } = useActiveCluster()
  const cluster = active?.id ?? ''
  const goPage = useGo()
  const { list, setList, options, error, loading, load } = useSchedules(cluster, connected)
  const [busy, setBusy] = useState('')  // the schedule being switched, run or deleted
  const [open, setOpen] = useState<Open | null>(null)
  const name = active?.name ?? cluster

  const act = <T,>(st: ScheduleStatus, method: string, params: Record<string, unknown>, done: (r: T) => string) => {
    setBusy(st.name)
    call<T>(method, { cluster, name: st.name, ...params })
      .then((r) => { toast(done(r)); if (Array.isArray(r)) setList(r as ScheduleStatus[]); else load() })
      .catch((e: Error) => toast(`Failed: ${e.message}`))
      .finally(() => setBusy(''))
  }
  const toggle = (st: ScheduleStatus, on: boolean) => act(st, 'schedules.toggle', { enabled: on },
    () => on ? `${st.name} is on` : `${st.name} is paused`)
  const runNow = (st: ScheduleStatus) => act<{ job: string }>(st, 'schedules.run_now', {},
    (r) => `${st.name}: started a run now${r.job ? ` (job ${r.job})` : ''}`)
  const remove = (st: ScheduleStatus) => act(st, 'schedules.delete', {}, () => `Deleted ${st.name}`)

  let body
  if (active && (!connected || error.startsWith('Connect to'))) body = <div className="h-[60vh]"><NotConnected
    cluster={active} session={session} what="scheduled agents" /></div>
  else if (error) body = <EmptyState icon={CircleAlert} title="Could not load the schedules" text={error} report />
  else if (!list) body = <div className="grid h-64 place-items-center"><Spinner size={24} /></div>
  else if (!list.length) body = <EmptyState icon={AlarmClock} title="No scheduled agents yet"
    text={`An agent can work on a task on ${name} by itself, every night or on the days you pick.`} />
  else body = (
    <>
      <List>
        {list.map((st) => <ScheduleRow key={st.name} st={st} busy={busy === st.name}
          onToggle={(on) => toggle(st, on)} onRun={() => runNow(st)} onLog={() => setOpen({ kind: 'log', st })}
          onEdit={() => isBackupCheck(st) ? goPage('backup', { cluster }) : setOpen({ kind: 'edit', st })}
          onDelete={() => setOpen({ kind: 'delete', st })} />)}
      </List>
      <p className="px-5 pt-2 text-sm text-dim">Runs at the set time, even with your laptop off.</p>
    </>
  )

  return (
    <>
      <PageBar>
        <span className="flex-1" />
        {connected && <>
          {loading && list && <Spinner />}
          <IconBtn icon={RefreshCw} label="Refresh" onClick={load} />
          <Button kind="primary" icon={Plus} disabled={!list || !options}
            onClick={() => setOpen({ kind: 'edit', st: null })}>New schedule</Button>
        </>}
      </PageBar>
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">{body}</div>
      {open?.kind === 'edit' && options && active && (
        <ScheduleDialog cluster={active} options={options} editing={open.st} onClose={() => setOpen(null)}
          onSaved={(l, n) => { setOpen(null); setList(l); toast(`Saved ${n}`) }} />
      )}
      {open?.kind === 'log' && (
        <BackLayer onBack={() => setOpen(null)}>
          <LogDialog cluster={cluster} name={open.st.name} onClose={() => setOpen(null)} />
        </BackLayer>
      )}
      {open?.kind === 'delete' && (
        <ConfirmDialog title={`Delete ${open.st.name}?`} danger keep="Keep it" confirm="Delete"
          text="It stops running, and its task and logs are removed from the cluster." onClose={() => setOpen(null)}
          onConfirm={() => remove(open.st)} />
      )}
    </>
  )
}

function ScheduleRow({ st, busy, onToggle, onRun, onLog, onEdit, onDelete }: {
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
    <ItemRow onPress={onEdit} label={<span className="font-medium">{backup ? 'Weekly scratch check' : st.name}</span>}
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
          className="grid size-9 place-items-center rounded-md text-dim active:bg-pressed" groups={[[
            { label: 'Run once now', icon: Play, onClick: onRun },
            { label: 'Last answer', icon: FileText, onClick: onLog },
            { label: backup ? 'Change in Backup' : 'Edit', icon: Pencil, onClick: onEdit },
          ], [{ label: 'Delete', icon: Trash2, danger: true, onClick: onDelete }]]} />
      </>} />
  )
}
