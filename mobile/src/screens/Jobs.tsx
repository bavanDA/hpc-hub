// Jobs: yours, your group's, your last week, or everyone's, on one cluster. Search sits over the list; whose jobs,
// states and order are in the filter sheet, and one line says what the list shows. A job opens its details (with
// Cancel). Usage opens it on one person's jobs ({ cluster, user }).
import { ListChecks, RefreshCw, SearchX, SlidersHorizontal, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo, usePageParams } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Job, JobList, Scope } from '@shared/types/jobs'
import type { Account } from '@shared/types/usage'
import { usePhoneNav } from '../nav'
import { Header } from '../parts/Header'
import { ORDERS, SCOPE_TEXT, shownJobs } from '../parts/jobs/filters'
import { FilterSheet } from '../parts/jobs/FilterSheet'
import { JobRow } from '../parts/jobs/JobRow'
import { stateWord } from '../parts/jobs/words'
import { JobSheet } from '../parts/JobSheet'
import { useConnected } from '../parts/useConnected'
import { Button, EmptyState, List, Row, SearchField, Segments } from '../ui'

const REFRESH_MS = 15_000
const n = (v: number) => Math.round(v).toLocaleString('en-US')

/** The account most of your hours go to, as one row that opens Usage. */
function HoursRow({ accounts, onOpen }: { accounts: Account[]; onOpen: () => void }) {
  const a = accounts.reduce<Account | null>((x, y) => (!x || y.used > x.used ? y : x), null)
  if (!a) return null
  return a.quota > 0
    ? <Row label="Hours left (SU)" sub={a.account} value={n(Math.max(0, a.quota - a.used))} opens onPress={onOpen} />
    : <Row label="Hours used (SU)" sub={[a.account, a.period].filter(Boolean).join(' · ')} value={n(a.used)} opens
        onPress={onOpen} />
}

export function Jobs() {
  const { live, current, pick } = useConnected()
  const { open: openTab } = usePhoneNav()
  const go = useGo()
  const params = usePageParams()  // from Usage: { cluster, user } shows that person's jobs
  const [scope, setScope] = useState<Scope>(params.user ? 'all' : 'mine')
  const [states, setStates] = useState<string[]>([])
  const [group, setGroup] = useState('')  // with My group: one of your groups, '' = all of them
  const [query, setQuery] = useState(params.user ?? '')
  const [order, setOrder] = useState(ORDERS[0])
  const [filtering, setFiltering] = useState(false)
  const [got, setGot] = useState({ key: '', list: null as JobList | null, error: '' })
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<Job | null>(null)
  const turn = useRef(0)
  const id = current?.id ?? ''
  const account = scope === 'group' ? group : ''
  const key = `${id}|${scope}|${account}`

  useEffect(() => {
    if (params.cluster) pick(params.cluster)
    if (params.user) { setScope('all'); setQuery(params.user) }
  }, [params.cluster, params.user, pick])

  const refresh = useCallback(() => {
    if (!id) return
    const mine = ++turn.current
    setLoading(true)
    call<JobList>('jobs.list', { cluster: id, scope, account })
      .then((list) => mine === turn.current && setGot({ key: `${id}|${scope}|${account}`, list, error: '' }))
      .catch((e: Error) => mine === turn.current &&
        setGot({ key: `${id}|${scope}|${account}`, list: null, error: e.message }))
      .finally(() => mine === turn.current && setLoading(false))
  }, [id, scope, account])
  useEffect(() => {
    refresh()
    const t = setInterval(() => document.visibilityState === 'visible' && refresh(), REFRESH_MS)
    return () => clearInterval(t)
  }, [refresh])

  const list = got.key === key ? got.list : null
  const error = got.key === key ? got.error : ''
  const shown = useMemo(() => shownJobs(list?.jobs ?? [], states, query, order), [list, states, query, order])
  const filtered = scope !== 'mine' || states.length > 0 || order !== ORDERS[0]
  const reset = () => { setScope('mine'); setStates([]); setOrder(ORDERS[0]) }
  const total = list?.jobs.length ?? 0
  const narrowed = states.length > 0 || query.trim() !== ''
  const what = [SCOPE_TEXT[scope], states.map(stateWord).join(', '), order === ORDERS[0] ? '' : order.label]
    .filter(Boolean).join(' · ')

  return (
    <div className="flex h-full flex-col">
      <Header title="Jobs">
        {current && <>
          <button aria-label={filtered ? 'Filter, some on' : 'Filter'} onClick={() => setFiltering(true)}
            className="relative grid size-12 place-items-center rounded-full active:bg-pressed">
            <SlidersHorizontal size={22} />
            {filtered && <span className="absolute top-3 right-3 size-2 rounded-full bg-text" />}</button>
          <button aria-label="Refresh" onClick={refresh}
            className="grid size-12 place-items-center rounded-full active:bg-pressed">
            {loading ? <Spinner size={22} /> : <RefreshCw size={22} />}</button>
        </>}
      </Header>
      {!current
        ? <div className="flex flex-1 flex-col justify-center">
            <EmptyState icon={WifiOff} title="No cluster connected" text="Connect a cluster to see its jobs."
              action={<Button kind="primary" onClick={() => openTab('clusters')}>Go to Clusters</Button>} />
          </div>
        : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex flex-col gap-3 px-4 pb-1">
              {live.length > 1 && <Segments label="Cluster" value={current.id}
                options={live.map((c) => [c.id, shortName(c)] as const)} onChange={pick} />}
              <SearchField value={query} onChange={setQuery} placeholder="Search id, name, person, queue" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-4">
              <button onClick={() => setFiltering(true)} className="flex min-h-12 w-full items-center px-4 text-left
                text-sm break-words text-dim active:bg-pressed">
                {list && total > 0 ? `${what} · ${narrowed ? `${shown.length} of ${total}` : total}` : what}</button>
              {error && <p className="px-4 py-3 text-bad">{error}</p>}
              {!list && !error && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
              {list && !total && <EmptyState icon={ListChecks} title="No jobs"
                text={scope === 'mine' ? "You don't have any jobs running or waiting." : 'Nothing to show here.'} />}
              {list && total > 0 && !shown.length && <EmptyState icon={SearchX} title="No jobs match"
                text="Try another state or search."
                action={<Button onClick={() => { setStates([]); setQuery('') }}>Show all</Button>} />}
              {shown.length > 0 && <List>
                {shown.map((j) => <JobRow key={j.job_id} job={j} showUser={scope === 'all' || scope === 'group'}
                  onOpen={() => setOpen(j)} />)}
              </List>}
              {list?.accounts.length ? <List className="mt-6">
                <HoursRow accounts={list.accounts} onOpen={() => go('usage', { cluster: id })} />
              </List> : null}
            </div>
          </div>
        )}
      {filtering && <FilterSheet scope={scope} states={states} order={order} onScope={setScope} onStates={setStates}
        groups={got.list?.groups ?? []} group={group} onGroup={setGroup}
        onOrder={setOrder} onReset={reset} onClose={() => setFiltering(false)}
        count={list ? shown.length : null} />}
      {open && current && <JobSheet cluster={current.id} job={open} appJob={list?.app_job ?? ''}
        onClose={() => setOpen(null)} onChanged={refresh} />}
    </div>
  )
}
