// Jobs: my jobs, my history or all jobs on one cluster, with filters, details and cancel.
import { CircleAlert, ListChecks, RefreshCw, Search, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { CancelDialog } from '../components/jobs/CancelDialog'
import { notConnected, useClusters } from '../components/jobs/clusters'
import { DetailsDialog } from '../components/jobs/DetailsDialog'
import { sortJobs, usageText } from '../components/jobs/format'
import { JobTable, type Sort } from '../components/jobs/JobTable'
import { Select } from '../components/jobs/Select'
import { Card, EmptyState, Spinner } from '../components/ui'
import { call } from '../rpc'
import type { Job, JobList, Scope } from '../types/jobs'

const REFRESH_MS = 15_000
const NO_JOBS = 'Nothing to show for this view.'
const NO_MATCH = 'Try another state or filter.'
const SCOPES = [['mine', 'My jobs'], ['history', 'My history (7 days)'], ['all', 'All jobs']] as const
const STATES = [['', 'Any state'], ...['RUNNING', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']
  .map((s) => [s, s] as const)] as const

export function Jobs() {
  const { clusters, cluster, session, connected, setCluster, error: clustersError } = useClusters()
  const [scope, setScope] = useState<Scope>('mine')
  const [state, setState] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'id', desc: true })
  // the last answer, for one cluster and scope: another view shows nothing until its own answer is in
  const [got, setGot] = useState({ key: '', list: null as JobList | null, error: '', updated: '' })
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Job | null>(null)
  const [cancel, setCancel] = useState<Job | null>(null)
  const turn = useRef(0) // answers to an older cluster or scope are dropped
  const busy = useRef(false)
  const id = cluster?.id ?? ''
  const key = `${id}|${scope}`
  const list = got.key === key ? got.list : null
  const error = got.key === key ? got.error : ''

  const refresh = useCallback((quiet = false) => {
    if (!id || !connected || (quiet && busy.current)) return
    const mine = ++turn.current
    busy.current = true
    setLoading(true)
    call<JobList>('jobs.list', { cluster: id, scope })
      .then((d) => mine === turn.current &&
        setGot({ key: `${id}|${scope}`, list: d, error: '', updated: new Date().toLocaleTimeString('en-GB') }))
      .catch((e: Error) => mine === turn.current &&
        setGot({ key: `${id}|${scope}`, list: null, error: e.message, updated: '' }))
      .finally(() => {
        if (mine !== turn.current) return
        busy.current = false
        setLoading(false)
      })
  }, [id, scope, connected])

  useEffect(() => refresh(), [refresh])
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(true), REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const jobs = (list?.jobs ?? []).filter((j) => (!state || j.state === state) &&
      (!q || [j.job_id, j.name, j.user, j.partition].some((v) => v.toLowerCase().includes(q))))
    return sortJobs(jobs, sort.key, sort.desc)
  }, [list, state, query, sort])

  if (clustersError) return <EmptyState icon={CircleAlert} title="Could not load clusters" text={clustersError} />
  if (!clusters || !cluster) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>

  const off = !connected && notConnected(cluster.name, session, 'jobs')
  let body
  if (off) body = <EmptyState icon={WifiOff} title={off.title} text={off.text} />
  else if (error) body = <EmptyState icon={CircleAlert} title="Could not load jobs" text={error} />
  else if (!list) body = <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  else if (!list.jobs.length) body = <EmptyState icon={ListChecks} title="No jobs" text={NO_JOBS} />
  else if (!shown.length) body = <EmptyState icon={Search} title="No matching jobs" text={NO_MATCH} />
  else body = (
    <div className="min-w-fit px-3 pb-3">
      <Card className="overflow-clip">
        <JobTable jobs={shown} showUser={scope === 'all'} sort={sort} onSort={setSort} onOpen={setOpen}
          onCancel={setCancel} />
      </Card>
    </div>
  )
  const usage = list ? usageText(list.accounts) : ''

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 p-3">
        <Select label="Cluster" value={cluster.id} onChange={setCluster}
          options={clusters.map((c) => [c.id, c.name] as const)} />
        <Select label="Which jobs" value={scope} onChange={setScope} options={SCOPES} />
        <Select label="State" value={state} onChange={setState} options={STATES} />
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md bg-pill px-3
          focus-within:ring-2 focus-within:ring-accent">
          <Search size={16} className="shrink-0 text-dim" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by id, name, user, partition"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" />
        </label>
        <button aria-label="Refresh" title="Refresh" onClick={() => refresh()} disabled={!connected || loading}
          className="grid size-9 shrink-0 place-items-center rounded-md bg-pill hover:bg-selected disabled:opacity-50">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="@container min-h-0 flex-1 overflow-auto scheme-light-dark">{body}</div>
      {!off && !error && <footer className="flex h-11 shrink-0 items-center gap-4 border-t border-line bg-header px-4
        text-[13px]">
        <span className="shrink-0 text-dim">
          {list ? `${list.jobs.length} jobs · updated ${got.updated}` : 'Loading…'}</span>
        <span className="min-w-0 flex-1 truncate text-right" title={usage &&
          'Service units (core hours) of your Slurm accounts. A QoS that charges 0 (like low on Wulver) is free.'}>
          {usage}</span>
      </footer>}
      {open && <DetailsDialog cluster={cluster.id} job={open} onClose={() => setOpen(null)}
        onCancel={() => { setOpen(null); setCancel(open) }} />}
      {cancel && <CancelDialog cluster={cluster.id} job={cancel} appJob={list?.app_job ?? ''}
        onClose={() => setCancel(null)} onDone={() => refresh(true)} />}
    </div>
  )
}
