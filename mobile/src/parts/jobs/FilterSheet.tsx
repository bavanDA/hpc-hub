// Jobs › Filter: whose jobs, which states and the order, out of the way of the list. Changes show at once; the main
// button closes the sheet on the list it made.
import { Check } from 'lucide-react'

import type { Scope } from '@shared/types/jobs'
import { Button, Chips, MainButton, Row, Section, Segments, Sheet } from '../../ui'
import { ORDERS, SCOPES, STATE_CHIPS, type Order } from './filters'

export function FilterSheet({ scope, states, order, count, onScope, onStates, onOrder, onReset, onClose }: {
  scope: Scope; states: string[]; order: Order; count: number | null
  onScope: (s: Scope) => void; onStates: (s: string[]) => void; onOrder: (o: Order) => void; onReset: () => void
  onClose: () => void
}) {
  const changed = scope !== 'mine' || states.length > 0 || order !== ORDERS[0]
  return (
    <Sheet title="Filter jobs" onClose={onClose} flush actions={<>
      {changed && <Button className="shrink-0" onClick={onReset}>Clear filters</Button>}
      <MainButton className="flex-1" onClick={onClose}>
        {count == null ? 'Show jobs' : `Show ${count} ${count === 1 ? 'job' : 'jobs'}`}</MainButton>
    </>}>
      <section className="px-4 pt-2">
        <h3 className="pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Whose</h3>
        <Segments label="Whose jobs" value={scope} options={SCOPES} onChange={onScope} />
      </section>
      <section className="px-4 pt-5">
        <h3 className="pb-0.5 text-xs font-semibold tracking-wide text-dim uppercase">State</h3>
        <Chips options={STATE_CHIPS} value={states} onChange={onStates} />
      </section>
      <Section title="Order">
        {ORDERS.map((o) => (
          <Row key={o.label} label={o.label} onPress={() => onOrder(o)}>
            {o === order ? <Check size={20} aria-label="Chosen" className="shrink-0" /> : <span className="w-5" />}
          </Row>
        ))}
      </Section>
    </Sheet>
  )
}
