import { CircleAlert, ListChecks, RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useActiveCluster } from '../components/clusters/active'
import { NotConnected } from '../components/clusters/NotConnected'
import { CancelDialog } from '../components/jobs/CancelDialog'
import { CancelManyDialog } from '../components/jobs/CancelManyDialog'
import type { Sort } from '../components/jobs/columns'
import { DetailsDialog } from '../components/jobs/DetailsDialog'
import { filterJobs, sortJobs, stateName } from '../components/jobs/format'
import { JobsFooter } from '../components/jobs/JobsFooter'
import { JobTable } from '../components/jobs/JobTable'
import { PickedBar } from '../components/jobs/PickedBar'
import { Select } from '../components/jobs/Select'
import { useJobList } from '../components/jobs/useJobList'
import { EmptyState } from '../components/ui/EmptyState'
import { IconButton } from '../components/ui/IconButton'
import { SkeletonRows } from '../components/ui/SkeletonRows'
import { Spinner } from '../components/ui/Spinner'
import { usePageParams } from '../nav'
import type { Job, Scope } from '../types/jobs'

const SCOPES = [['mine', 'My jobs'], ['group', 'My group'], ['history', 'My history (7 days)'],
  ['all', 'All jobs']] as const
const STATES = [['', 'Any state'], ...['RUNNING', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']
  .map((s) => [s, stateName(s)] as const)] as const

export function Jobs() {
  const { clusters, cluster, session, connected, setCluster, error: clustersError } = useActiveCluster()
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
  const [open, setOpen] = useState<Job | null>(null)
  const [cancel, setCancel] = useState<Job | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [cancelMany, setCancelMany] = useState(false)
  const lastGroups = useRef<string[]>([])  // kept while another view loads
  const { key, list, error, updated, loading, refresh } =
    useJobList(cluster?.id ?? '', scope, scope === 'group' ? group : '', connected)

  useEffect(() => setPicked(new Set()), [key])
  const chosen = (list?.jobs ?? []).filter((j) => j.cancellable && picked.has(j.job_id))  // gone ones drop out
  const shown = useMemo(() => sortJobs(filterJobs(list?.jobs ?? [], state, query), sort.key, sort.desc),
    [list, state, query, sort])

  if (clustersError) return <EmptyState icon={CircleAlert} title="Could not load clusters" text={clustersError} report />
  if (!clusters || !cluster) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>

  const off = !connected
  const groups = list?.groups ?? lastGroups.current
  if (list?.groups) lastGroups.current = list.groups
  const done = () => { setPicked(new Set()); refresh(true) }
  let body
  if (off) body = <NotConnected cluster={cluster} session={session} what="jobs" />
  else if (error) body = <EmptyState icon={CircleAlert} title="Could not load jobs" text={error} report />
  else if (!list) body = <SkeletonRows rows={6} height={44} />
  else if (!list.jobs.length) body = <EmptyState icon={ListChecks} title="No jobs" text="Nothing to show for this view." />
  else if (!shown.length) body = <EmptyState icon={Search} title="No matching jobs" text="Try another state or filter." />
  else body = (
    // scrolls sideways itself, so the ⋮ column can stay pinned on the right
    <div className="overflow-x-auto">
      <JobTable jobs={shown} showUser={scope === 'all' || scope === 'group'} sort={sort} onSort={setSort} onOpen={setOpen}
        onCancel={setCancel} picked={picked} onPick={setPicked} />
    </div>
  )

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
      {!off && chosen.length > 0 && <PickedBar chosen={chosen} onClear={() => setPicked(new Set())}
        onCancel={() => (chosen.length === 1 ? setCancel(chosen[0]) : setCancelMany(true))} />}
      <div className="@container min-h-0 flex-1 overflow-auto scheme-light-dark">{body}</div>
      {!off && !error && <JobsFooter list={list} updated={updated} />}
      {open && <DetailsDialog cluster={cluster.id} job={open} onClose={() => setOpen(null)}
        onCancel={() => { setOpen(null); setCancel(open) }} />}
      {cancel && <CancelDialog cluster={cluster.id} job={cancel} appJob={list?.app_job ?? ''}
        onClose={() => setCancel(null)} onDone={done} />}
      {cancelMany && <CancelManyDialog cluster={cluster.id} jobs={chosen} appJob={list?.app_job ?? ''}
        onClose={() => setCancelMany(false)} onDone={done} />}
    </div>
  )
}
