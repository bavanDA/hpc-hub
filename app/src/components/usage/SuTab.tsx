// SU: the account's total against its limit (or its cost where SU are billed), and who used it.
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

import type { Account, People } from '../../types/usage'
import { Term } from '../Term'
import { Card, List, Pill, Row, Spinner } from '../ui'
import { n, pct } from './format'
import { Bar, Section } from './parts'

function Summary({ a }: { a: Account | null }) {
  if (!a) return <Card className="p-4 text-dim">No Slurm account found.</Card>
  const cost = a.rate ? ` About $${n(a.used * a.rate)} at $${a.rate} per SU.` : ''
  const span = a.period ? ` in ${a.period}` : ''
  return (
    <Card className="flex flex-col gap-3 p-4">
      {a.quota > 0
        ? <p className="text-2xl font-bold tabular-nums">{n(Math.max(0, a.quota - a.used))} <Term name="su">hours left (SU)</Term></p>
        : <p className="text-2xl font-bold tabular-nums">{n(a.used)} <Term name="su">hours used (SU)</Term>{span}</p>}
      <p className="text-dim">
        {a.quota > 0
          ? `${a.account} used ${n(a.used)} of ${n(a.quota)} (${pct(a.used, a.quota)})${span}. You used ${n(a.mine)} of it.`
          : `${a.account} has no SU limit${span}. You used ${n(a.mine)}.${cost}`}
      </p>
      {a.quota > 0 && <Bar value={a.used / a.quota} mine={a.mine / a.quota} className="w-full" />}
    </Card>
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
      <Section title="Group"><Summary a={account} /></Section>
      {account && (
        <Section title={`Who used it, ${period.toLowerCase()}`} note={<span className="inline-flex items-center gap-2">
          {loading && people && <Spinner size={14} />}{note}</span>}>
          {people && (
            <List>
              {active.map((p) => (
                <Row key={p.user} onClick={onPerson ? () => onPerson(p.user) : undefined}
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
