import type { Cluster, Session } from '../../types'
import type { Allocation } from '../../types/usage'
import { Bar } from './Bar'
import { CARD } from './card'
import { CardHead } from './CardHead'
import { footer, headline, paceLine, tag } from './pace'
import type { OpenView } from './view'
import { Weeks } from './Weeks'

export function AllocationCard({ a, c, s, me, onOpen }: { a: Allocation; c: Cluster; s?: Session; me: string; onOpen: OpenView }) {
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
      <CardHead c={c} s={s} right={red && (
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
