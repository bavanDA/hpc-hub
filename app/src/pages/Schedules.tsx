// Scheduled agents (experimental): an agent runs a task on its own, e.g. clean the code every night at 02:00.
// Spec: hpc_hub/agents/ui/schedules_page.py.
import { AlarmClock, CircleAlert, Plus, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { useActiveCluster } from '../components/clusters/active'
import { NotConnected } from '../components/clusters/NotConnected'
import { LogDialog } from '../components/schedules/LogDialog'
import { ScheduleDialog } from '../components/schedules/ScheduleDialog'
import { isBackupCheck, ScheduleRow } from '../components/schedules/ScheduleRow'
import { useToast } from '../components/toast'
import { AlertDialog, Button, EmptyState, IconButton, List, Spinner } from '../components/ui'
import { useEvent } from '../hooks'
import { useGo } from '../nav'
import { call } from '../rpc'
import type { Session } from '../types'
import type { ScheduleOptions, ScheduleStatus } from '../types/schedules'

type Open = { kind: 'edit'; st: ScheduleStatus | null } | { kind: 'log' | 'delete'; st: ScheduleStatus }

export function Schedules() {
  const toast = useToast()
  const { cluster: active, session, connected } = useActiveCluster()
  const cluster = active?.id ?? ''
  const goPage = useGo()
  const [list, setList] = useState<ScheduleStatus[] | null>(null)
  const [options, setOptions] = useState<ScheduleOptions | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')  // the schedule being switched, run or deleted
  const [open, setOpen] = useState<Open | null>(null)

  useEffect(() => { setList(null); setOptions(null); setError('') }, [cluster])  // another cluster picked

  const load = useCallback(() => {
    if (!cluster || !connected) return
    setLoading(true)
    call<ScheduleStatus[]>('schedules.list', { cluster })
      .then((l) => { setList(l); setError('') })
      .catch((e: Error) => { setList(null); setError(e.message) })
      .finally(() => setLoading(false))
    call<ScheduleOptions>('schedules.options', { cluster }).then(setOptions).catch(() => {})
  }, [cluster, connected])
  useEffect(load, [load])
  useEvent<Session>('session', (s) => { if (s.id === cluster && s.state === 'Connected' && !list) load() })

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
  else if (error) body = <div className="h-[60vh]"><EmptyState icon={CircleAlert}
    title="Could not load the schedules" text={error} /></div>
  else if (!list) body = <div className="grid h-64 place-items-center"><Spinner size={24} /></div>
  else if (!list.length) body = <div className="h-[60vh]"><EmptyState icon={AlarmClock} title="No scheduled agents yet"
    text={`An agent can work on a task on ${name} by itself, every night or on the days you pick.`}
    action={<Button kind="primary" disabled={!options} onClick={() => setOpen({ kind: 'edit', st: null })}>
      New schedule</Button>} /></div>
  else body = (
    <>
      <List>
        {list.map((st) => <ScheduleRow key={st.name} st={st} busy={busy === st.name}
          onToggle={(on) => toggle(st, on)} onRun={() => runNow(st)} onLog={() => setOpen({ kind: 'log', st })}
          onEdit={() => isBackupCheck(st) ? goPage('backup', { cluster }) : setOpen({ kind: 'edit', st })} onDelete={() => setOpen({ kind: 'delete', st })} />)}
      </List>
      <p className="px-1 text-sm text-dim">
        Each schedule is a Slurm job that waits for its time, runs the agent once, then queues the next run. It
        keeps going with your laptop off. Answers are saved in its logs folder.</p>
    </>
  )

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4 px-4 py-6">
      {connected && <div className="flex items-center gap-2">
        <span className="flex-1" />
        {loading && list && <Spinner />}
        <IconButton icon={RefreshCw} label="Refresh" size={16} onClick={load} />
        <Button kind="suggested" disabled={!list || !options} onClick={() => setOpen({ kind: 'edit', st: null })}>
          <Plus size={16} />New schedule</Button>
      </div>}
      {body}
      {open?.kind === 'edit' && options && <ScheduleDialog cluster={cluster} clusterName={name} options={options}
        editing={open.st} onClose={() => setOpen(null)} onSaved={saved} />}
      {open?.kind === 'log' && <LogDialog cluster={cluster} name={open.st.name} onClose={() => setOpen(null)} />}
      {open?.kind === 'delete' && (
        <AlertDialog title={`Delete ${open.st.name}?`} keep="Keep it" act="Delete" onClose={() => setOpen(null)}
          onAct={() => remove(open.st)}>
          <p>It stops running and its task and logs are removed from the cluster.</p>
        </AlertDialog>
      )}
    </div>
  )
}
