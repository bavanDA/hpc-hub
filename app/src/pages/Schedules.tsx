import { AlarmClock, CircleAlert, Plus, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import { useActiveCluster } from '../components/clusters/active'
import { NotConnected } from '../components/clusters/NotConnected'
import { Confirm } from '../components/e/Confirm'
import { EButton } from '../components/e/EButton'
import { EmptyState } from '../components/e/EmptyState'
import { EPage } from '../components/e/EPage'
import { IconBtn } from '../components/e/IconBtn'
import { List } from '../components/e/List'
import { isBackupCheck } from '../components/schedules/format'
import { LogDialog } from '../components/schedules/LogDialog'
import { ScheduleDialog } from '../components/schedules/ScheduleDialog'
import { ScheduleRow } from '../components/schedules/ScheduleRow'
import { useSchedules } from '../components/schedules/useSchedules'
import { Spinner } from '../components/ui/Spinner'
import { useToast } from '../components/useToast'
import { useGo } from '../nav'
import { call } from '../rpc'
import type { ScheduleStatus } from '../types/schedules'

type Open = { kind: 'edit'; st: ScheduleStatus | null } | { kind: 'log' | 'delete'; st: ScheduleStatus }

export function Schedules() {
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
  const remove = (st: ScheduleStatus) => { setOpen(null); act(st, 'schedules.delete', {}, () => `Deleted ${st.name}`) }
  const saved = (l: ScheduleStatus[], n: string) => { setOpen(null); setList(l); toast(`Saved ${n}`) }

  let body
  if (active && (!connected || error.startsWith('Connect to'))) body = <div className="h-[60vh]"><NotConnected
    cluster={active} session={session} what="scheduled agents" /></div>
  else if (error) body = <EmptyState icon={CircleAlert} title="Could not load the schedules" text={error} />
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
    <EPage width={820} actions={connected && <>
      {loading && list && <Spinner />}
      <IconBtn icon={RefreshCw} label="Refresh" onClick={load} />
      <EButton kind="primary" icon={Plus} disabled={!list || !options}
        onClick={() => setOpen({ kind: 'edit', st: null })}>New schedule</EButton>
    </>}>
      {body}
      {open?.kind === 'edit' && options && <ScheduleDialog cluster={cluster} clusterName={name} options={options}
        editing={open.st} onClose={() => setOpen(null)} onSaved={saved} />}
      {open?.kind === 'log' && <LogDialog cluster={cluster} name={open.st.name} onClose={() => setOpen(null)} />}
      {open?.kind === 'delete' && (
        <Confirm title={`Delete ${open.st.name}?`} keep="Keep it" act="Delete" onClose={() => setOpen(null)}
          onAct={() => remove(open.st)}>
          <p>It stops running, and its task and logs are removed from the cluster.</p>
        </Confirm>
      )}
    </EPage>
  )
}
