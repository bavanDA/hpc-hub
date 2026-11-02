// Agents › Scheduled (experimental): an agent that runs a task by itself, like cleaning the code every night at
// 02:00. Each one is a Slurm job that waits for its time, so it runs with your phone off. Tap one for its actions.
import { AlarmClock, CircleAlert, FileText, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { computeText, localWhen, status } from '@shared/components/schedules/format'
import { EmptyState, Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { ScheduleOptions, ScheduleStatus } from '@shared/types/schedules'
import { ActionSheet, Button, ConfirmSheet, useToast } from '../../ui'
import { NotConnectedHere, useClusterTab } from './ClusterTabs'
import { LogSheet, ScheduleSheet } from './ScheduleSheet'

type Open = { kind: 'menu' | 'log' | 'delete'; st: ScheduleStatus } | { kind: 'edit'; st: ScheduleStatus | null }

const KIND = { ok: 'bg-ok-bg text-ok', warn: 'bg-warn-bg text-warn', dim: 'bg-pill text-dim' } as const

export function Scheduled() {
  const toast = useToast()
  const { current, picker } = useClusterTab()
  const cluster = current?.id ?? ''
  const [list, setList] = useState<ScheduleStatus[] | null>(null)
  const [options, setOptions] = useState<ScheduleOptions | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<Open | null>(null)
  const picked = useRef(false)  // an action picked from the menu (the menu closes itself first)

  const load = useCallback(() => {
    if (!cluster) return
    call<ScheduleStatus[]>('schedules.list', { cluster })
      .then((l) => { setList(l); setError('') })
      .catch((e: Error) => { setList(null); setError(e.message) })
    call<ScheduleOptions>('schedules.options', { cluster }).then(setOptions).catch(() => {})
  }, [cluster])
  useEffect(() => { setList(null); setError(''); load() }, [load])

  const act = <T,>(st: ScheduleStatus, method: string, params: Record<string, unknown>, done: (r: T) => string) => {
    setBusy(st.name)
    call<T>(method, { cluster, name: st.name, ...params })
      .then((r) => { toast(done(r)); if (Array.isArray(r)) setList(r as ScheduleStatus[]); else load() })
      .catch((e: Error) => toast(`That didn't work: ${e.message}`))
      .finally(() => setBusy(''))
  }
  const then = (next: Open) => { picked.current = true; setOpen(next) }

  if (!current) return <NotConnectedHere what="scheduled agents" />
  return (
    <div>
      {picker}
      {error && <EmptyState icon={CircleAlert} title="Could not load the schedules" text={error} />}
      {!error && !list && <div className="grid h-40 place-items-center"><Spinner size={24} /></div>}
      {list && !list.length && (
        <div className="h-[45vh]"><EmptyState icon={AlarmClock} title="No scheduled agents yet"
          text={`An agent can work on a task on ${current.name} by itself, every night or on the days you pick.`} /></div>
      )}
      <div className="flex flex-col gap-2">
        {list?.map((st) => {
          const s = status(st)
          return (
            <div key={st.name} className="flex items-center gap-1 rounded-2xl bg-card shadow-[var(--shadow-card)]">
              <button onClick={() => { picked.current = false; setOpen({ kind: 'menu', st }) }}
                className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl py-3 pl-4 text-left active:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-bold">{st.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${KIND[s.kind]}`}>{s.label}</span>
                  </span>
                  <span className="block truncate text-sm text-dim">{[st.agent_name, st.when].join(' · ')}</span>
                  <span className="block truncate text-sm text-dim">{[s.note, st.last_run
                    ? `Last run ${localWhen(st.last_run)}` : 'Not run yet', computeText(st.compute)].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
              {busy === st.name ? <span className="grid size-12 place-items-center"><Spinner /></span> : (
                <label className="grid size-14 shrink-0 cursor-pointer place-items-center">
                  <input type="checkbox" role="switch" checked={st.enabled} className="peer sr-only"
                    aria-label={st.enabled ? `${st.name} is on` : `${st.name} is paused`}
                    onChange={(e) => act(st, 'schedules.toggle', { enabled: e.target.checked },
                      () => e.target.checked ? `${st.name} is on` : `${st.name} is paused`)} />
                  <span className="relative h-7 w-12 rounded-full bg-pill transition peer-checked:bg-accent after:absolute
                    after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition
                    peer-checked:after:translate-x-5" />
                </label>
              )}
            </div>
          )
        })}
      </div>
      {list && <Button kind="primary" icon={Plus} className="mt-3 w-full" disabled={!options}
        onClick={() => setOpen({ kind: 'edit', st: null })}>New schedule</Button>}
      {list && list.length > 0 && <p className="mt-3 text-sm text-dim">Each one waits as a Slurm job for its time, runs the
        agent once, then queues the next run. Answers are saved in its logs folder.</p>}

      {open?.kind === 'menu' && (
        <ActionSheet title={open.st.name} onClose={() => queueMicrotask(() => { if (!picked.current) setOpen(null) })}
          actions={[
            { label: 'Run once now', icon: Play, onPick: () => { setOpen(null); act<{ job: string }>(open.st,
              'schedules.run_now', {}, (r) => `${open.st.name} started a run${r.job ? ` (job ${r.job})` : ''}`) } },
            { label: 'Last answer', icon: FileText, onPick: () => then({ kind: 'log', st: open.st }) },
            { label: 'Edit', icon: Pencil, onPick: () => then({ kind: 'edit', st: open.st }) },
            { label: 'Delete', icon: Trash2, danger: true, onPick: () => then({ kind: 'delete', st: open.st }) },
          ]} />
      )}
      {open?.kind === 'log' && <LogSheet cluster={cluster} name={open.st.name} onClose={() => setOpen(null)} />}
      {open?.kind === 'edit' && options && (
        <ScheduleSheet cluster={cluster} clusterName={current.name} options={options} editing={open.st}
          onClose={() => setOpen(null)} onSaved={(l, n) => { setOpen(null); setList(l); toast(`Saved ${n}`) }} />
      )}
      {open?.kind === 'delete' && (
        <ConfirmSheet title={`Delete ${open.st.name}?`} danger keep="Keep it" confirm="Delete" onClose={() => setOpen(null)}
          text="It stops running, and its task and logs are removed from the cluster."
          onConfirm={() => act(open.st, 'schedules.delete', {}, () => `Deleted ${open.st.name}`)} />
      )}
    </div>
  )
}
