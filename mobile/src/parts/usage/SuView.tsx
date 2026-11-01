// SU: how many are left (or used, without a limit) first, then who used them in the period. Tap a person for their jobs.
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import { n, pct } from '@shared/components/usage/format'
import { Bar } from '@shared/components/usage/parts'
import { Spinner } from '@shared/components/ui'
import type { Account, People } from '@shared/types/usage'
import { Card, ListRow } from '../../ui'

export function SuHeadline({ a }: { a: Account }) {
  const span = a.period ? ` in ${a.period}` : ''
  const cost = a.rate ? ` About $${n(a.used * a.rate)} at $${a.rate} per SU.` : ''
  return (
    <Card>
      <p className="text-3xl font-bold tabular-nums">
        {a.quota > 0 ? `${n(Math.max(0, a.quota - a.used))} SU left` : `${n(a.used)} SU used${span}`}</p>
      <p className="mt-1 text-dim">
        {a.quota > 0
          ? `${a.account} used ${n(a.used)} of ${n(a.quota)} (${pct(a.used, a.quota)})${span}. You used ${n(a.mine)} of it.`
          : `${a.account} has no SU limit${span}. You used ${n(a.mine)}.${cost}`}</p>
      {a.quota > 0 && <Bar value={a.used / a.quota} mine={a.mine / a.quota} className="mt-3 w-full" />}
    </Card>
  )
}

export function SuView({ account, people, error, period, onPerson }: {
  account: Account; people: People | null; error: string; period: string; onPerson: (user: string) => void
}) {
  const [idleOpen, setIdleOpen] = useState(false)
  const all = people?.people ?? []
  const active = all.filter((p) => p.hours > 0)
  const idle = all.filter((p) => p.hours <= 0)
  const total = all.reduce((s, p) => s + p.charged, 0)
  return (
    <div className="flex flex-col gap-5">
      <SuHeadline a={account} />
      <section>
        <h2 className="mb-1 text-sm font-bold text-dim">Who used it, {period.toLowerCase()}</h2>
        {error && <p className="text-sm text-bad">Couldn't load: {error}</p>}
        {!people && !error && <div className="grid h-24 place-items-center"><Spinner size={24} /></div>}
        {people && (
          <Card className="py-1">
            {active.map((p) => (
              <ListRow key={p.user} onClick={() => onPerson(p.user)}
                title={<span className="flex items-center gap-2">{p.name || p.user}
                  {p.user === people.me && <span className="rounded-full bg-ok-bg px-2 text-xs font-semibold text-ok">
                    you</span>}</span>}
                subtitle={<span className="tabular-nums">{n(p.charged)} SU · {pct(p.charged, total)} ·{' '}
                  {n(p.hours)} core hours</span>} />
            ))}
            {!active.length && <ListRow title="Nobody used this account in this period" />}
          </Card>
        )}
        {people && active.length > 0 && <p className="mt-1 text-sm text-dim">Tap a person to see their jobs.</p>}
      </section>
      {idle.length > 0 && (
        <section>
          <button onClick={() => setIdleOpen(!idleOpen)} className="flex h-11 items-center gap-1 font-semibold">
            {idleOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />} No usage in this period ({idle.length})
          </button>
          {idleOpen && <Card className="py-1">
            {idle.map((p) => <ListRow key={p.user} title={p.name || p.user} subtitle={p.user} />)}</Card>}
        </section>
      )}
    </div>
  )
}
