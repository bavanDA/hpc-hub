import type { Account } from '../../types/usage'
import { Term } from '../Term'
import { Bar } from './Bar'
import { n, pct } from './format'

export function SuSummary({ a }: { a: Account | null }) {
  if (!a) return <p className="border-y border-line px-4 py-3 text-dim">No Slurm account found.</p>
  const cost = a.rate ? ` About $${n(a.used * a.rate)} at $${a.rate} per SU.` : ''
  const span = a.period ? ` in ${a.period}` : ''
  return (
    <div className="flex flex-col gap-3 border-y border-line px-4 py-3">
      <div className="flex min-h-8 items-center gap-3">
        <span className="flex-1">{a.quota > 0 ? <Term name="su">Hours left (SU)</Term>
          : <><Term name="su">Hours used (SU)</Term>{span}</>}</span>
        <span className="text-xl font-semibold tabular-nums">{n(a.quota > 0 ? Math.max(0, a.quota - a.used) : a.used)}</span>
      </div>
      {a.quota > 0 && <Bar value={a.used / a.quota} mine={a.mine / a.quota} className="w-full" />}
      <p className="text-sm text-dim">
        {a.quota > 0
          ? `${a.account} used ${n(a.used)} of ${n(a.quota)} (${pct(a.used, a.quota)})${span}. You used ${n(a.mine)} of it.`
          : `${a.account} has no SU limit${span}. You used ${n(a.mine)}.${cost}`}
      </p>
    </div>
  )
}
