// Hours (SU): how many are left (or used, without a limit) first, then who used them in the period. A person opens
// Jobs on their jobs.
import { useState, type ReactNode } from 'react'

import { n, pct } from '@shared/components/usage/format'
import { Spinner } from '@shared/components/ui'
import type { Account, People } from '@shared/types/usage'
import { List, Row, Section } from '../../ui'
import { Bar } from './Bar'
import { TermRow } from './Term'

export function SuHeadline({ a, top }: { a: Account; top?: ReactNode }) {
  return (
    <List>
      {top}
      {a.quota > 0 ? <>
        <TermRow name="su" label="Hours left (SU)" value={n(Math.max(0, a.quota - a.used))} />
        <div className="border-b border-line px-4 py-3">
          <Bar value={a.used / a.quota} mine={a.mine / a.quota} label="Used" />
          <p className="pt-2 text-sm text-dim tabular-nums">
            {n(a.used)} of {n(a.quota)} used ({pct(a.used, a.quota)}), {n(a.mine)} by you</p>
        </div>
      </> : <TermRow name="su" label="Hours used (SU)" value={n(a.used)} sub={a.period || undefined} />}
      {!a.quota && <Row label="You used" value={n(a.mine)} />}
      {!a.quota && a.rate > 0 && <Row label="Cost" sub={`$${a.rate} per SU`} value={`About $${n(a.used * a.rate)}`} />}
    </List>
  )
}

// top: rows that go first (the group); periodRow: the period, which only changes who used it
export function SuView({ account, people, error, top, periodRow, onPerson }: {
  account: Account; people: People | null; error: string; top?: ReactNode; periodRow: ReactNode
  onPerson: (user: string) => void
}) {
  const [idleOpen, setIdleOpen] = useState(false)
  const all = people?.people ?? []
  const active = all.filter((p) => p.hours > 0)
  const idle = all.filter((p) => p.hours <= 0)
  const total = all.reduce((s, p) => s + p.charged, 0)
  return (
    <>
      <SuHeadline a={account} top={top} />
      <Section title="Who used it">
        {periodRow}
        {error && <p className="border-b border-line px-4 py-3 text-bad">Couldn't load: {error}</p>}
        {!people && !error && <div className="grid h-24 place-items-center border-b border-line"><Spinner size={24} /></div>}
        {active.map((p) => (
          <Row key={p.user} opens onPress={() => onPerson(p.user)}
            label={<>{p.name || p.user}{p.user === people?.me && <span className="text-dim"> (you)</span>}</>}
            sub={pct(p.charged, total)} value={`${n(p.charged)} SU`} />
        ))}
        {people && !active.length && <Row label="Nobody used it in this period" />}
        {idle.length > 0 && <Row label={idle.length === 1 ? '1 person with no usage' : `${idle.length} people with no usage`}
          value={<span className="font-normal text-dim">{idleOpen ? 'Hide' : 'Show'}</span>}
          onPress={() => setIdleOpen(!idleOpen)} />}
        {idleOpen && idle.map((p) => <Row key={p.user} label={p.name || p.user}
          sub={p.name ? p.user : undefined} />)}
      </Section>
    </>
  )
}
