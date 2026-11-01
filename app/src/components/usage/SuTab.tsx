// SU: the account's total against its limit (or its cost where SU are billed), and who used it.
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { Account, People } from '../../types/usage'
import { Card, List, Pill, Row, Spinner } from '../ui'
import { n, pct } from './format'
import { Bar, Section } from './parts'

function Summary({ a }: { a: Account | null }) {
  if (!a) return <Card className="p-4 text-dim">No Slurm account found.</Card>
  const cost = a.rate ? ` · about $${n(a.used * a.rate)} at $${a.rate} per SU` : ''
  return (
    <Card className="flex flex-col gap-3 p-4">
      <p>
        <b>{a.account}</b>: {a.quota
          ? `${n(a.used)} of ${n(a.quota)} SU used (${pct(a.used, a.quota)}) · ${n(a.quota - a.used)} left · ` +
            `yours ${n(a.mine)}`
          : `${n(a.used)} SU used${a.period ? ` in ${a.period}` : ''}, no limit${cost} · yours ${n(a.mine)}`}
      </p>
      {a.quota > 0 && <Bar value={a.used / a.quota} mine={a.mine / a.quota} className="w-full" />}
    </Card>
  )
}

export function SuTab({ account, people, error, loading, period }: {
  account: Account | null; people: People | null; error: string; loading: boolean; period: string
}) {
  const [idleOpen, setIdleOpen] = useState(false)
  const all = people?.people ?? []
  const active = all.filter((p) => p.hours > 0)
  const idle = all.filter((p) => p.hours <= 0)
  const total = all.reduce((s, p) => s + p.charged, 0)
  const hours = all.reduce((s, p) => s + p.hours, 0)
  const note = error ? `Could not load: ${error}` : !people ? `${period}. Loading…`
    : `${period}: ${n(total)} SU across ${n(hours)} core hours (free QoS included).`

  return (
    <>
      <Section title="Account"><Summary a={account} /></Section>
      {account && (
        <Section title="Who used it" note={<span className="inline-flex items-center gap-2">
          {loading && people && <Spinner size={14} />}{note}</span>}>
          {people && (
            <List>
              {active.map((p) => (
                <Row key={p.user}
                  title={<span className="flex items-center gap-2">{p.name || p.user}
                    {p.user === people.me && <Pill kind="ok">you</Pill>}</span>}
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
        <section className="flex flex-col gap-2">
          <button onClick={() => setIdleOpen(!idleOpen)} className="flex w-fit items-center gap-1 font-semibold">
            {idleOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />} No usage in this period ({idle.length})
          </button>
          {idleOpen && <List>{idle.map((p) => <Row key={p.user} title={p.name || p.user} subtitle={p.user} />)}</List>}
        </section>
      )}
    </>
  )
}
