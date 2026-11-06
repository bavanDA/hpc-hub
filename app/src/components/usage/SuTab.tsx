import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import type { Account, People } from '../../types/usage'
import { List, Row, Spinner } from '../ui'
import { n, pct } from './format'
import { Bar } from './Bar'
import { Section } from './Section'
import { SuSummary } from './SuSummary'

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
      <Section><SuSummary a={account} /></Section>
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
                    <Bar value={total ? p.charged / total : 0} />
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
            <span className="flex-1">{idle.length === 1 ? '1 person with no usage' : `${idle.length} people with no usage`}
            </span>
            <ChevronDown size={16} aria-label={idleOpen ? 'Hide' : 'Show'}
              className={`text-dim transition-transform ${idleOpen ? 'rotate-180' : ''}`} />
          </button>
          {idleOpen && <List>{idle.map((p) => <Row key={p.user} title={p.name || p.user} subtitle={p.user} />)}</List>}
        </section>
      )}
    </>
  )
}
