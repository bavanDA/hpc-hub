// Jobs: yours, your last week, or everyone's, on one cluster; tap one for details and to cancel it.
import { ListChecks, RefreshCw, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { STATE_COLOR, usageText } from '@shared/components/jobs/format'
import { EmptyState, Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Job, JobList, Scope } from '@shared/types/jobs'
import { Header } from '../parts/Header'
import { JobSheet } from '../parts/JobSheet'
import { useConnected } from '../parts/useConnected'
import { Segments } from '../ui'

const REFRESH_MS = 15_000
const SCOPES = [['mine', 'Mine'], ['history', '7 days'], ['all', 'Everyone']] as const

export function Jobs() {
  const { live, current, pick } = useConnected()
  const [scope, setScope] = useState<Scope>('mine')
  const [got, setGot] = useState({ key: '', list: null as JobList | null, error: '' })
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Job | null>(null)
  const turn = useRef(0)
  const id = current?.id ?? ''
  const key = `${id}|${scope}`

  const refresh = useCallback(() => {
    if (!id) return
    const mine = ++turn.current
    setLoading(true)
    call<JobList>('jobs.list', { cluster: id, scope })
      .then((list) => mine === turn.current && setGot({ key: `${id}|${scope}`, list, error: '' }))
      .catch((e: Error) => mine === turn.current && setGot({ key: `${id}|${scope}`, list: null, error: e.message }))
      .finally(() => mine === turn.current && setLoading(false))
  }, [id, scope])
  useEffect(() => {
    refresh()
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  const list = got.key === key ? got.list : null
  const error = got.key === key ? got.error : ''
  return (
    <div className="flex h-full flex-col">
      <Header title="Jobs">
        {current && <button aria-label="Refresh" onClick={refresh}
          className="grid size-12 place-items-center rounded-full active:bg-hover">
          {loading ? <Spinner size={22} /> : <RefreshCw size={22} />}</button>}
      </Header>
      {!current ? <EmptyState icon={WifiOff} title="Not connected" text="Connect a cluster to see its jobs." /> : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4">
          {live.length > 1 && <Segments value={current.id} options={live.map((c) => [c.id, c.name] as const)}
            onChange={pick} />}
          <Segments value={scope} options={SCOPES} onChange={setScope} />
          {list?.accounts.length ? <p className="text-sm text-dim">{usageText(list.accounts)}</p> : null}
          <div className="min-h-0 flex-1 overflow-y-auto pb-4">
            {error && <p className="rounded-xl bg-bad-bg p-3 text-bad">{error}</p>}
            {!list && !error && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
            {list && !list.jobs.length && <EmptyState icon={ListChecks} title="No jobs" text="Nothing to show here." />}
            <div className="flex flex-col gap-2">
              {list?.jobs.map((j) => (
                <button key={j.job_id} onClick={() => setOpen(j)}
                  className="rounded-2xl bg-card p-4 text-left shadow-[var(--shadow-card)] active:bg-hover">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-bold">{j.name}</span>
                    <span className={`text-sm font-bold ${STATE_COLOR[j.state] ?? 'text-dim'}`}>{j.state}</span>
                  </div>
                  <p className="mt-1 truncate text-sm text-dim">
                    {[j.job_id, scope === 'all' ? j.user : '', j.elapsed, `${j.cpus} cores`, j.where]
                      .filter(Boolean).join(' · ')}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {open && current && <JobSheet cluster={current.id} job={open} onClose={() => setOpen(null)}
        onCancelled={refresh} />}
    </div>
  )
}
