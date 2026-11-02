// Jobs: my jobs, my history or all jobs on one cluster, with filters, details and cancel.
import { CircleAlert, ListChecks, RefreshCw, Search } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { NotConnected } from '../components/clusters/NotConnected'
import { CancelDialog, CancelManyDialog } from '../components/jobs/CancelDialog'
import { useClusters } from '../components/jobs/clusters'
import { DetailsDialog } from '../components/jobs/DetailsDialog'
import { sortJobs, stateName, usageText } from '../components/jobs/format'
import { JobTable, type Sort } from '../components/jobs/JobTable'
import { Select } from '../components/jobs/Select'
import { Button, EmptyState, IconButton, SkeletonRows, Spinner } from '../components/ui'
import { usePageParams } from '../nav'
import { call } from '../rpc'
import type { Job, JobList, Scope } from '../types/jobs'

const REFRESH_MS = 15_000
const NO_JOBS = 'Nothing to show for this view.'
const NO_MATCH = 'Try another state or filter.'
const SCOPES = [['mine', 'My jobs'], ['group', 'My group'], ['history', 'My history (7 days)'],
  ['all', 'All jobs']] as const
const STATES = [['', 'Any state'], ...['RUNNING', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']
  .map((s) => [s, stateName(s)] as const)] as const

export function Jobs() {
  const { clusters, cluster, session, connected, setCluster, error: clustersError } = useClusters()
  const params = usePageParams()  // from Usage: { cluster, user } shows that person's jobs
  const [scope, setScope] = useState<Scope>(params.user ? 'all' : 'mine')
  const [state, setState] = useState('')
  const [group, setGroup] = useState('')  // with My group: one of your groups, '' = all of them
  const [query, setQuery] = useState(params.user ?? '')
  useEffect(() => {
    if (params.cluster) setCluster(params.cluster)
    if (params.user) { setScope('all'); setQuery(params.user) }
  }, [params.cluster, params.user])  // eslint-disable-line react-hooks/exhaustive-deps
  const [sort, setSort] = useState<Sort>({ key: 'id', desc: true })
  // the last answer, for one cluster and scope: another view shows nothing until its own answer is in
  const [got, setGot] = useState({ key: '', list: null as JobList | null, error: '', updated: '' })
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Job | null>(null)
  const [cancel, setCancel] = useState<Job | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [cancelMany, setCancelMany] = useState(false)
  const lastGroups = useRef<string[]>([])  // kept while another view loads
  const turn = useRef(0) // answers to an older cluster or scope are dropped
  const busy = useRef(false)
  const id = cluster?.id ?? ''
  const account = scope === 'group' ? group : ''
  const key = `${id}|${scope}|${account}`
  const list = got.key === key ? got.list : null
  const error = got.key === key ? got.error : ''

  const refresh = useCallback((quiet = false) => {
    if (!id || !connected || (quiet && busy.current)) return
    const mine = ++turn.current
    busy.current = true
    setLoading(true)
    call<JobList>('jobs.list', { cluster: id, scope, account })
      .then((d) => mine === turn.current &&
        setGot({ key: `${id}|${scope}|${account}`, list: d, error: '', updated: new Date().toLocaleTimeString('en-GB') }))
      .catch((e: Error) => mine === turn.current &&
        setGot({ key: `${id}|${scope}|${account}`, list: null, error: e.message, updated: '' }))
      .finally(() => {
        if (mine !== turn.current) return
        busy.current = false
        setLoading(false)
      })
  }, [id, scope, account, connected])

  useEffect(() => refresh(), [refresh])
  useEffect(() => {
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(true), REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  useEffect(() => setPicked(new Set()), [key])
  const chosen = (list?.jobs ?? []).filter((j) => j.cancellable && picked.has(j.job_id))  // gone ones drop out

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const jobs = (list?.jobs ?? []).filter((j) => (!state || j.state === state) &&
      (!q || [j.job_id, j.name, j.user, j.partition, j.reason].some((v) => v.toLowerCase().includes(q))))
    return sortJobs(jobs, sort.key, sort.desc)
  }, [list, state, query, sort])

  if (clustersError) return <EmptyState icon={CircleAlert} title="Could not load clusters" text={clustersError} />
  if (!clusters || !cluster) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>

  const off = !connected
  const groups = list?.groups ?? lastGroups.current
  if (list?.groups) lastGroups.current = list.groups
  let body
  if (off) body = <NotConnected cluster={cluster} session={session} what="jobs" />
  else if (error) body = <EmptyState icon={CircleAlert} title="Could not load jobs" text={error} />
  else if (!list) body = <SkeletonRows rows={6} height={44} />
  else if (!list.jobs.length) body = <EmptyState icon={ListChecks} title="No jobs" text={NO_JOBS} />
  else if (!shown.length) body = <EmptyState icon={Search} title="No matching jobs" text={NO_MATCH} />
  else body = (
    // scrolls sideways itself, so the ⋮ column can stay pinned on the right
    <div className="overflow-x-auto">
      <JobTable jobs={shown} showUser={scope === 'all' || scope === 'group'} sort={sort} onSort={setSort} onOpen={setOpen}
        onCancel={setCancel} picked={picked} onPick={setPicked} />
    </div>
  )
  const usage = list ? usageText(list.accounts) : ''

  return (
    <div className="flex h-full flex-col">
      {!off && <div className="flex shrink-0 items-center gap-2 px-4 py-3">
        <Select label="Which jobs" value={scope} onChange={setScope} options={SCOPES} />
        {scope === 'group' && groups.length > 1 && <Select label="Group" value={group} onChange={setGroup}
          options={[['', 'All my groups'], ...groups.map((g) => [g, g] as const)]} />}
        <Select label="State" value={state} onChange={setState} options={STATES} />
        <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-soft px-3
          focus-within:ring-1 focus-within:ring-accent">
          <Search size={16} className="shrink-0 text-dim" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search id, name, person, queue"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" />
        </label>
        {loading ? <span className="grid size-9 shrink-0 place-items-center"><Spinner /></span>
          : <IconButton icon={RefreshCw} label="Refresh" onClick={() => refresh()} disabled={!connected} />}
      </div>}
      {!off && chosen.length > 0 && <div className="flex shrink-0 items-center gap-3 border-y border-line px-4 py-2">
        <span className="flex-1 font-medium">{chosen.length} {chosen.length === 1 ? 'job' : 'jobs'} picked</span>
        <Button onClick={() => setPicked(new Set())}>Clear</Button>
        <Button kind="danger-solid" onClick={() => chosen.length === 1 ? setCancel(chosen[0]) : setCancelMany(true)}>
          {chosen.length === 1 ? 'Cancel job' : `Cancel ${chosen.length} jobs`}</Button>
      </div>}
      <div className="@container min-h-0 flex-1 overflow-auto scheme-light-dark">{body}</div>
      {!off && !error && <footer className="flex h-11 shrink-0 items-center gap-4 border-t border-line bg-window px-4
        text-sm">
        <span className="shrink-0 text-dim">
          {list ? `${list.jobs.length} jobs · updated ${got.updated}` : 'Loading…'}</span>
        <span className="min-w-0 flex-1 truncate text-right" title={usage &&
          "Service units, the cluster's currency. 1 SU is roughly 1 core for 1 hour. Free queues cost nothing."}>
          {usage}</span>
      </footer>}
      {open && <DetailsDialog cluster={cluster.id} job={open} onClose={() => setOpen(null)}
        onCancel={() => { setOpen(null); setCancel(open) }} />}
      {cancel && <CancelDialog cluster={cluster.id} job={cancel} appJob={list?.app_job ?? ''}
        onClose={() => setCancel(null)} onDone={() => { setPicked(new Set()); refresh(true) }} />}
      {cancelMany && <CancelManyDialog cluster={cluster.id} jobs={chosen} appJob={list?.app_job ?? ''}
        onClose={() => setCancelMany(false)} onDone={() => { setPicked(new Set()); refresh(true) }} />}
    </div>
  )
}
