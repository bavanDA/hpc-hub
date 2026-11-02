// SU: the account's total against its limit (or its cost where SU are billed), and who used it.
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { Account, People } from '../../types/usage'
import { Term } from '../Term'
import { List, Row, Spinner } from '../ui'
import { n, pct } from './format'
import { Bar, Section } from './parts'

function Summary({ a }: { a: Account | null }) {
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

export function SuTab({ account, people, error, loading, period, onPerson }: {
  account: Account | null; people: People | null; error: string; loading: boolean; period: string
  onPerson?: (user: string) => void
}) {
  const [idleOpen, setIdleOpen] = useState(false)
  const all = people?.people ?? []
  const active = all.filter((p) => p.hours > 0)
  const idle = all.filter((p) => p.hours <= 0)
  const total = all.reduce((s, p) => s + p.charged, 0)
  const hours = all.reduce((s, p) => s + p.hours, 0)
  const note = error ? `Could not load: ${error}` : !people ? `${period}. Loading…`
    : `${n(total)} SU across ${n(hours)} core hours, free queues included.`

  return (
    <>
      <Section><Summary a={account} /></Section>
      {account && (
        <Section title="Who used it" note={<span className="inline-flex items-center gap-2">
          {loading && people && <Spinner size={14} />}{note}</span>}>
          {people && (
            <List>
              {active.map((p) => (
                <Row key={p.user} onClick={onPerson ? () => onPerson(p.user) : undefined}
                  title={<span>{p.name || p.user}{p.user === people.me && <span className="text-dim"> (you)</span>}
                    </span>}
                  subtitle={`${p.user} · ${n(p.hours)} core hours`}
                  suffix={<>
                    <span className="w-36 text-right text-base tabular-nums">
                      {n(p.charged)} SU · <span className="text-dim">{pct(p.charged, total)}</span></span>
                    <Bar value={total ? p.charged / total : 0} share />
                  </>} />
              ))}
              {!active.length && <Row title="Nobody used this account in this period" />}
            </List>
          )}
        </Section>
      )}
      {idle.length > 0 && (
        <section className="flex flex-col">
          <button onClick={() => setIdleOpen(!idleOpen)} className="flex min-h-12 items-center gap-3 border-y
            border-line px-4 text-left hover:bg-hover active:bg-pressed">
            <span className="flex-1">No usage in this period</span>
            <span className="font-medium tabular-nums">{idle.length}</span>
            {idleOpen ? <ChevronDown size={16} className="text-dim" /> : <ChevronRight size={16} className="text-dim" />}
          </button>
          {idleOpen && <List>{idle.map((p) => <Row key={p.user} title={p.name || p.user} subtitle={p.user} />)}</List>}
        </section>
      )}
    </>
  )
}
