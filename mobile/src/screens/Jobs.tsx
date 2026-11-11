// Jobs: the desktop page on a phone (app/src/pages/Jobs.tsx): whose jobs and which state as selects, search, a list
// with ticks, cancel one or several (always asks first), the details window. Usage opens it on one person's jobs
// ({ cluster, user }).
import { CircleAlert, ListChecks, RefreshCw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useActiveCluster } from '@shared/components/clusters/active'
import { ClusterPicker } from '@shared/components/clusters/ClusterPicker'
import { NotConnected } from '@shared/components/clusters/NotConnected'
import { CancelDialog } from '@shared/components/jobs/CancelDialog'
import { CancelManyDialog } from '@shared/components/jobs/CancelManyDialog'
import type { Sort } from '@shared/components/jobs/columns'
import { DetailsDialog } from '@shared/components/jobs/DetailsDialog'
import { filterJobs, sortJobs, stateName, usageText } from '@shared/components/jobs/format'
import { PickedBar } from '@shared/components/jobs/PickedBar'
import { useJobList } from '@shared/components/jobs/useJobList'
import { EmptyState } from '@shared/components/ui/EmptyState'
import { SkeletonRows } from '@shared/components/ui/SkeletonRows'
import { Spinner } from '@shared/components/ui/Spinner'
import { usePageParams } from '@shared/nav'
import type { Job, Scope } from '@shared/types/jobs'
import { Choice } from '../parts/Choice'
import { Header } from '../parts/Header'
import { JobHead, JobRow } from '../parts/jobs/JobList'
import { NoClusters } from '../parts/NoClusters'
import { BackLayer, IconBtn, SearchField } from '../ui'

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

  const groups = list?.groups ?? lastGroups.current
  if (list?.groups) lastGroups.current = list.groups
  const done = () => { setPicked(new Set()); refresh(true) }
  const flip = (id: string) => {
    const next = new Set(picked)
    if (!next.delete(id)) next.add(id)
    setPicked(next)
  }
  const usage = list ? usageText(list.accounts) : ''

  let body
  if (clusters && !clusters.length) body = <NoClusters />
  else if (clustersError) body = <EmptyState icon={CircleAlert} title="Could not load clusters" text={clustersError} report />
  else if (!clusters || !cluster) body = <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  else if (!connected) body = <NotConnected cluster={cluster} session={session} what="jobs" />
  else if (error) body = <EmptyState icon={CircleAlert} title="Could not load jobs" text={error} report />
  else if (!list) body = <SkeletonRows rows={6} height={60} />
  else if (!list.jobs.length) body = <EmptyState icon={ListChecks} title="No jobs" text="Nothing to show for this view." />
  else if (!shown.length) body = <EmptyState icon={Search} title="No matching jobs" text="Try another state or filter." />
  else {
    const anyCancel = shown.some((j) => j.cancellable)
    body = shown.map((j) => <JobRow key={j.job_id} job={j} showUser={scope === 'all' || scope === 'group'}
      anyCancel={anyCancel} picked={picked.has(j.job_id)} onPick={() => flip(j.job_id)} onOpen={() => setOpen(j)}
      onCancel={() => setCancel(j)} />)
  }

  return (
    <div className="flex h-full flex-col">
      <Header title="Jobs" chip={<ClusterPicker />} />
      {connected && (
        <div className="flex shrink-0 flex-col gap-2 p-3">
          <div className="flex items-center gap-2">
            <Choice label="Which jobs" value={scope} onPick={setScope} options={SCOPES} className="min-w-0 flex-1" />
            <Choice label="State" value={state} onPick={setState} options={STATES} className="min-w-0 flex-1" />
            {loading ? <span className="grid size-10 shrink-0 place-items-center"><Spinner /></span>
              : <IconBtn icon={RefreshCw} label="Refresh" onClick={() => refresh()} />}
          </div>
          {scope === 'group' && groups.length > 1 && <Choice label="Group" value={group} onPick={setGroup}
            options={[['', 'All my groups'], ...groups.map((g) => [g, g] as const)]} />}
          <SearchField value={query} onChange={setQuery} placeholder="Search id, name, person, queue" />
        </div>
      )}
      {connected && chosen.length > 0 && <PickedBar chosen={chosen} onClear={() => setPicked(new Set())}
        onCancel={() => (chosen.length === 1 ? setCancel(chosen[0]) : setCancelMany(true))} />}
      {connected && list && shown.length > 0 && <JobHead sort={sort} onSort={setSort} jobs={shown} picked={picked}
        onPick={setPicked} />}
      <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      {connected && !error && (
        <footer className="flex shrink-0 flex-col border-t border-line bg-window px-3 pt-1.5 pb-2 text-sm">
          <span className="text-dim">{list ? `${list.jobs.length} jobs · updated ${updated}` : 'Loading…'}</span>
          {usage && <span>{usage}</span>}
        </footer>
      )}
      {open && cluster && <BackLayer onBack={() => setOpen(null)}>
        <DetailsDialog cluster={cluster.id} job={open} onClose={() => setOpen(null)}
          onCancel={() => { setOpen(null); setCancel(open) }} /></BackLayer>}
      {cancel && cluster && <BackLayer onBack={() => setCancel(null)}>
        <CancelDialog cluster={cluster.id} job={cancel} appJob={list?.app_job ?? ''}
          onClose={() => setCancel(null)} onDone={done} /></BackLayer>}
      {cancelMany && cluster && <BackLayer onBack={() => setCancelMany(false)}>
        <CancelManyDialog cluster={cluster.id} jobs={chosen} appJob={list?.app_job ?? ''}
          onClose={() => setCancelMany(false)} onDone={done} /></BackLayer>}
    </div>
  )
}
