// Usage at a glance: one card per group you can bill on every cluster shown, least time left first, then each
// cluster's storage and one line about the queues. Each part opens the fuller view of its cluster.
import { ChevronRight, CircleAlert, RefreshCw } from 'lucide-react'
import { useState } from 'react'

import type { Cluster, Session } from '../../types'
import type { Allocation, Allocations, Partition, Storage, StorageRow } from '../../types/usage'
import { NotConnected } from '../clusters/NotConnected'
import { StatusDot } from '../clusters/ClusterPicker'
import { shortName } from '../clusters/loginCopy'
import { Select } from '../jobs/Select'
import { IconButton, Skeleton, Spinner } from '../ui'
import { n } from './format'
import { Bar } from './parts'
import { day, footer, headline, paceLine, tag, timeLeft, weekEnds } from './pace'
import { useEach, type Answer } from './useRemote'

export type View = 'overview' | 'su' | 'storage' | 'load'
type Open = (cluster: string, view: View, account?: string) => void

const full = (c: Cluster) => c.name.split(' (')[0]  // "Wulver", "Yale Bouchet", "SDSC Expanse"
const SORTS = [['time', 'Sort: least time left'], ['cluster', 'Sort: by cluster']] as const
const CARD = 'rounded-xl border border-line bg-window'

// -- the 12 weeks -----------------------------------------------------------------------------------------------

/** SUs per week as a small area; hovering a week names its days and SUs. */
function Weeks({ weeks }: { weeks: number[] }) {
  const [at, setAt] = useState<number | null>(null)
  const W = 240
  const H = 44
  const top = Math.max(...weeks, 1) * 1.1
  const x = (i: number) => (i * W) / (weeks.length - 1)
  const y = (v: number) => H - 1 - ((H - 4) * v) / top
  const line = weeks.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const ends = weekEnds(weeks.length)
  const first = (i: number) => { const d = new Date(ends[i]); d.setDate(d.getDate() - 6); return d }
  const iso = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
  return (
    <div>
      <div className="mb-1 truncate text-xs text-dim tabular-nums">
        {at == null ? 'SUs per week, last 12 weeks'
          : `${day(iso(first(at)))} to ${day(iso(ends[at]))}: ${n(weeks[at])} SUs`}
      </div>
      <div className="relative h-11" onMouseLeave={() => setAt(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-11 w-full" aria-hidden>
          <polygon points={`0,${H} ${line} ${W},${H}`} className="fill-soft" />
          <polyline points={line} fill="none" className="stroke-text" strokeWidth={1.6}
            vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          {at != null && <line x1={x(at)} x2={x(at)} y1={0} y2={H} className="stroke-line-strong"
            vectorEffect="non-scaling-stroke" />}
        </svg>
        {at != null && <span className="pointer-events-none absolute size-2 -translate-1/2 rounded-full bg-text
          ring-2 ring-window" style={{ left: `${(100 * at) / (weeks.length - 1)}%`, top: y(weeks[at]) }} />}
        <div className="absolute inset-0 flex">
          {weeks.map((v, i) => <span key={i} className="h-full flex-1" onMouseEnter={() => setAt(i)}
            aria-label={`${day(iso(ends[i]))}: ${n(v)} SUs`} />)}
        </div>
      </div>
    </div>
  )
}

// -- cards ---------------------------------------------------------------------------------------------------------

function Head({ c, s, right }: { c: Cluster; s?: Session; right?: React.ReactNode }) {
  return (
    <div className="flex h-[22px] items-center gap-2">
      <StatusDot session={s} /><span className="truncate text-sm text-dim">{full(c)}</span>
      <span className="flex-1" />{right}
    </div>
  )
}

function Card({ a, c, s, me, onOpen }: { a: Allocation; c: Cluster; s?: Session; me: string; onOpen: Open }) {
  const [big, unit] = headline(a)
  const pace = paceLine(a)
  const red = tag(a)
  const open = () => onOpen(c.id, 'su', a.account)
  return (
    <div role="button" tabIndex={0} onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() } }}
      title={`See who used ${a.account}`}
      className={`${CARD} flex cursor-pointer flex-col gap-3 px-[18px] pt-[18px] pb-4 text-left transition-colors
        hover:border-line-strong focus-visible:outline-2 focus-visible:outline-focus`}>
      <Head c={c} s={s} right={red && (
        <span className="inline-flex h-[22px] items-center gap-1.5 rounded-full bg-bad-bg px-2 text-xs font-medium
          whitespace-nowrap text-bad"><span className="size-1.5 rounded-full bg-bad-dot" />{red}</span>)} />
      <div>
        <div className="truncate text-md font-semibold">{a.account}</div>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-[32px] leading-[38px] font-semibold tabular-nums">{big}</span>
          <span className="text-sm text-dim">{unit}</span>
        </div>
      </div>
      {a.quota > 0 ? <Bar value={a.used / a.quota} mine={a.mine / a.quota} className="w-full" />
        : <div className="h-2 text-xs leading-2 text-dim">{a.rate > 0 ? 'No limit, billed per SU' : 'No limit'}</div>}
      <p className="min-h-9 text-sm">{pace.bold && <b className="font-semibold">{pace.bold}</b>}{pace.text}</p>
      {a.weeks ? <Weeks weeks={a.weeks} />
        : <p className="flex h-16 items-center text-xs text-dim">
          SUs per week are not available on this cluster.</p>}
      <div className="mt-auto truncate border-t border-line pt-2.5 text-xs text-dim"
        title={footer(a, me)}>{footer(a, me)}</div>
    </div>
  )
}

/** A card that stands in for a cluster's groups: loading, could not read, none to bill. */
function Note({ c, s, title, text, busy }: { c: Cluster; s?: Session; title: string; text?: string; busy?: boolean }) {
  return (
    <div className={`${CARD} flex flex-col gap-3 px-[18px] pt-[18px] pb-4`}>
      <Head c={c} s={s} right={busy && <Spinner size={14} />} />
      <div className="text-md font-semibold">{title}</div>
      {busy ? <><Skeleton className="h-9 w-40" /><Skeleton className="h-2 w-full" /><Skeleton className="h-16 w-full" /></>
        : text && <p className="text-sm break-words text-dim">{text}</p>}
    </div>
  )
}

// -- storage and queues -----------------------------------------------------------------------------------------

/** 1463 of 2048 GB -> '1.4 of 2 TB'; small ones stay in GB. */
function size(r: StorageRow): string {
  const tb = (gb: number) => Number((gb / 1024).toFixed(1)).toString()
  if (!r.quota) return r.used >= 1000 ? `${tb(r.used)} TB used` : `${n(r.used)} GB used`
  return r.quota >= 1000 ? `${tb(r.used)} of ${tb(r.quota)} TB` : `${n(r.used)} of ${n(r.quota)} GB`
}

function StorageCard({ c, s, got, onOpen }: { c: Cluster; s?: Session; got: Answer<Storage>; onOpen: Open }) {
  const rows = got.data?.rows ?? []
  return (
    <div className={`${CARD} px-[18px] pt-3 pb-2`}>
      <button onClick={() => onOpen(c.id, 'storage')} title={`Open storage on ${full(c)}`}
        className="-mx-2 flex items-center gap-2 rounded-md px-2 py-0.5 font-semibold hover:bg-hover">
        <StatusDot session={s} />{full(c)}<ChevronRight size={14} className="text-dim" />
      </button>
      {got.loading && !got.data && <div className="flex flex-col gap-3 py-3"><Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" /></div>}
      {got.error && <p className="py-2 text-sm text-dim">Could not read storage: {got.error}</p>}
      {got.data?.raw && !rows.length && <p className="py-2 text-sm text-dim">
        The quota tool's answer is shown as plain text. Open storage to read it.</p>}
      {got.data && !rows.length && !got.data.raw && <p className="py-2 text-sm text-dim">No quotas found.</p>}
      {rows.map((r) => (
        <div key={r.label} className="py-[9px]">
          <div className="mb-1.5 flex gap-2 text-sm"><span className="min-w-0 flex-1 truncate">{r.label}</span>
            <span className="whitespace-nowrap tabular-nums">{size(r)}</span></div>
          {r.quota > 0 && <Bar value={r.used / r.quota} mine={r.mine != null ? r.mine / r.quota : null}
            className="w-full" />}
          {(r.purged ?? 0) > 0 && <div className="mt-1 text-xs text-dim">
            Files older than {r.purged} days are deleted</div>}
        </div>
      ))}
    </div>
  )
}

/** "general 94% busy, 102 waiting": the queue with the most jobs waiting, or quiet when none wait. */
function queueText(parts: Partition[]): string {
  const up = parts.filter((p) => p.up)
  const top = up.reduce<Partition | null>((b, p) => (!b || p.pending > b.pending ? p : b), null)
  if (!top || !top.pending) return 'quiet'
  const busy = top.cpus_total ? `${Math.round((100 * top.cpus_used) / top.cpus_total)}% busy, ` : ''
  return `${top.name} ${busy}${n(top.pending)} waiting`
}

function Queues({ shown, load, onOpen }: { shown: Cluster[]; load: (id: string) => Answer<Partition[]>; onOpen: Open }) {
  if (!shown.length) return null
  return (
    <p className="text-sm text-dim">
      Queues now:{' '}
      {shown.map((c, i) => {
        const got = load(c.id)
        const text = got.data ? queueText(got.data) : got.error ? 'not read' : '…'
        return (
          <span key={c.id}>{i > 0 && ' · '}
            <button onClick={() => onOpen(c.id, 'load')} title={`Open queues on ${full(c)}`}
              className="hover:text-text hover:underline">{shortName(c)} {text}</button>
          </span>
        )
      })}
    </p>
  )
}

// -- the page -----------------------------------------------------------------------------------------------------

/** inset: under the page's own tabs (one cluster), lined up with them. */
export function Overview({ clusters, sessions, onOpen, inset }:
  { clusters: Cluster[]; sessions: Record<string, Session>; onOpen: Open; inset?: boolean }) {
  const [sort, setSort] = useState<'time' | 'cluster'>('time')
  const [tick, setTick] = useState(0)
  const on = clusters.filter((c) => sessions[c.id]?.connected)
  const ids = Object.fromEntries(on.map((c) => [c.id, { cluster: c.id }]))
  const groups = useEach<Allocations>('usage.allocations', ids, tick, true)
  const load = useEach<Partition[]>('usage.load', ids, tick)
  // storage asks with the busiest group (Expanse reads the group's quota), so it waits for the groups
  const storageIds = Object.fromEntries(on.flatMap((c) => {
    const g = groups(c.id)
    if (!g.data && !g.error) return []
    const busiest = (g.data?.groups ?? []).reduce<Allocation | null>((a, b) => (!a || b.used > a.used ? b : a), null)
    return [[c.id, { cluster: c.id, account: busiest?.account ?? '' }]]
  }))
  const storage = useEach<Storage>('usage.storage', storageIds, tick)

  type Item = { key: string; order: number; at: number; node: React.ReactNode; quiet?: boolean }
  const items: Item[] = []
  let count = 0
  const withData = new Set<string>()
  clusters.forEach((c, at) => {
    const s = sessions[c.id]
    if (!s?.connected) {
      items.push({ key: c.id, order: 2e9, at, quiet: true,
        node: <NotConnected compact cluster={c} session={s} what="usage" /> })
      return
    }
    const g = groups(c.id)
    if (g.data) {
      if (!g.data.groups.length) {
        items.push({ key: c.id, order: 1.5e9, at, node: <Note c={c} s={s} title="No groups to bill"
          text={`Your account on ${full(c)} is not in a group with SUs.`} /> })
      }
      for (const a of g.data.groups) {
        count++
        withData.add(c.id)
        items.push({ key: `${c.id}/${a.account}`, order: timeLeft(a), at,
          node: <Card a={a} c={c} s={s} me={g.data.me} onOpen={onOpen} /> })
      }
    } else if (g.error) {
      items.push({ key: c.id, order: 1.5e9, at, node: <Note c={c} s={s} title="Could not read groups" text={g.error} /> })
    } else {
      items.push({ key: c.id, order: 1.9e9, at, node: <Note c={c} s={s} title="Reading groups" busy /> })
    }
  })
  items.sort((a, b) => (sort === 'cluster' ? a.at - b.at || a.order - b.order : a.order - b.order || a.at - b.at))
  const busy = on.some((c) => groups(c.id).loading || load(c.id).loading || storage(c.id).loading)

  return (
    <div className={`flex flex-col pb-8 ${inset ? 'px-4 pt-3' : 'px-7 pt-[22px]'}`}>
      <div className="mb-[18px] flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-xl font-semibold">Allocations</h2>
        <span className="text-sm text-dim">
          {count ? `${count} group${count === 1 ? '' : 's'} on ${withData.size} cluster${withData.size === 1 ? '' : 's'}`
            + ' · darker part of each bar is you' : on.length ? '' : 'No cluster is connected'}</span>
        <span className="flex-1" />
        <Select label="Sort" value={sort} onChange={setSort} options={SORTS} />
        {busy && tick ? <span className="grid size-9 shrink-0 place-items-center"><Spinner /></span>
          : <IconButton icon={RefreshCw} label="Refresh" onClick={() => setTick(tick + 1)} disabled={!on.length} />}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-4">
        {items.map((it) => <div key={it.key} className={it.quiet ? 'self-start' : 'flex flex-col [&>*]:flex-1'}>
          {it.node}</div>)}
      </div>
      {on.length > 0 && <>
        <div className="mt-[26px] mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="text-xl font-semibold">Storage</h2>
          <span className="flex-1" />
          <Queues shown={on} load={load} onOpen={onOpen} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] items-start gap-4">
          {on.map((c) => <StorageCard key={c.id} c={c} s={sessions[c.id]} got={storage(c.id)} onOpen={onOpen} />)}
        </div>
      </>}
      {!clusters.length && <p className="flex items-center gap-2 text-dim"><CircleAlert size={16} />No clusters set up.</p>}
    </div>
  )
}
