// Jobs: yours, your group's, your last week, or everyone's, on one cluster. State chips and a search narrow the list,
// Sort orders it, and a job opens its details (with Cancel). Usage opens it on one person's jobs ({ cluster, user }).
import { ArrowUpDown, ListChecks, RefreshCw, SearchX, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { usageText } from '@shared/components/jobs/format'
import { EmptyState, Spinner } from '@shared/components/ui'
import { usePageParams } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Job, JobList, Scope } from '@shared/types/jobs'
import { usePhoneNav } from '../nav'
import { Header } from '../parts/Header'
import { JobSheet } from '../parts/JobSheet'
import { ORDERS, shownJobs, STATE_CHIPS } from '../parts/jobs/filters'
import { JobRow } from '../parts/jobs/JobRow'
import { useConnected } from '../parts/useConnected'
import { ActionSheet, Button, Chips, SearchField, Segments } from '../ui'

const REFRESH_MS = 15_000
const SCOPES = [['mine', 'Mine'], ['group', 'Group'], ['history', '7 days'], ['all', 'All']] as const

export function Jobs() {
  const { live, current, pick } = useConnected()
  const { open: openTab } = usePhoneNav()
  const params = usePageParams()  // from Usage: { cluster, user } shows that person's jobs
  const [scope, setScope] = useState<Scope>(params.user ? 'all' : 'mine')
  const [states, setStates] = useState<string[]>([])
  const [query, setQuery] = useState(params.user ?? '')
  const [order, setOrder] = useState(ORDERS[0])
  const [sorting, setSorting] = useState(false)
  const [got, setGot] = useState({ key: '', list: null as JobList | null, error: '' })
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Job | null>(null)
  const turn = useRef(0)
  const id = current?.id ?? ''
  const key = `${id}|${scope}`

  useEffect(() => {
    if (params.cluster) pick(params.cluster)
    if (params.user) { setScope('all'); setQuery(params.user) }
  }, [params.cluster, params.user, pick])

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
  const shown = useMemo(() => shownJobs(list?.jobs ?? [], states, query, order), [list, states, query, order])
  const filtered = states.length > 0 || query.trim() !== ''

  return (
    <div className="flex h-full flex-col">
      <Header title="Jobs">
        {current && <>
          <button aria-label="Sort" onClick={() => setSorting(true)}
            className="grid size-12 place-items-center rounded-full active:bg-hover"><ArrowUpDown size={22} /></button>
          <button aria-label="Refresh" onClick={refresh}
            className="grid size-12 place-items-center rounded-full active:bg-hover">
            {loading ? <Spinner size={22} /> : <RefreshCw size={22} />}</button>
        </>}
      </Header>
      {!current
        ? <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6">
            <EmptyState icon={WifiOff} title="No cluster connected" text="Connect a cluster to see its jobs." />
            <Button kind="primary" onClick={() => openTab('clusters')}>Go to Clusters</Button>
          </div>
        : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 px-4">
            {live.length > 1 && <Segments value={current.id} options={live.map((c) => [c.id, c.name] as const)}
              onChange={pick} />}
            <Segments value={scope} options={SCOPES} onChange={setScope} />
            <SearchField value={query} onChange={setQuery} placeholder="Search id, name, person, queue" />
            <Chips options={STATE_CHIPS} value={states} onChange={setStates} />
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              {list?.accounts.length ? <p className="mb-2 text-sm text-dim">{usageText(list.accounts)}</p> : null}
              {error && <p className="rounded-xl bg-bad-bg p-3 text-bad">{error}</p>}
              {!list && !error && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
              {list && !list.jobs.length && <EmptyState icon={ListChecks} title="No jobs"
                text={scope === 'mine' ? "You don't have any jobs running or waiting." : 'Nothing to show here.'} />}
              {list && list.jobs.length > 0 && !shown.length && <div className="flex flex-col items-center gap-3">
                <EmptyState icon={SearchX} title="No jobs match" text="Try another state or search." />
                <Button onClick={() => { setStates([]); setQuery('') }}>Show all</Button>
              </div>}
              {shown.length > 0 && <p className="mb-2 text-sm text-dim">
                {filtered ? `${shown.length} of ${list?.jobs.length} jobs` : `${shown.length} jobs`} · {order.label}</p>}
              <div className="flex flex-col gap-2">
                {shown.map((j) => <JobRow key={j.job_id} job={j} showUser={scope === 'all' || scope === 'group'}
                  onOpen={() => setOpen(j)} />)}
              </div>
            </div>
          </div>
        )}
      {sorting && <ActionSheet title="Sort jobs" onClose={() => setSorting(false)}
        actions={ORDERS.map((o) => ({ label: o.label === order.label ? `${o.label} ✓` : o.label,
          onPick: () => setOrder(o) }))} />}
      {open && current && <JobSheet cluster={current.id} job={open} appJob={list?.app_job ?? ''}
        onClose={() => setOpen(null)} onChanged={refresh} />}
    </div>
  )
}
