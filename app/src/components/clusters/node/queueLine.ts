import type { GuideQueue } from '../../../types/usage'
import { n } from '../../usage/format'
import { costText } from '../../usage/limitsText'
import { human } from '../time'

/** What one job can get on a queue, for its row in the list: time, cores, memory, cost. Unknown numbers are left out. */
export function queueLine(q: GuideQueue): string {
  const perNode = q.max_nodes !== 1 ? ' per node' : ''
  const cost = costText(q.billing, q.whole_nodes, q.gpus.length > 0).value
  return [q.longest !== null && `up to ${human(q.longest)}`, q.cores !== null && `up to ${n(q.cores)} cores`,
    q.memory_gb !== null && `up to ${n(q.memory_gb)} GB memory${perNode}`, cost !== 'Not listed' && cost]
    .filter(Boolean).join(' · ').replace(/^u/, 'U')
}

/** The line, then what is easy to miss about the queue. */
export function queueHint(q: GuideQueue): string {
  return [queueLine(q), q.whole_nodes && 'You always get whole nodes, even if you ask for fewer cores',
    q.can_be_stopped && 'Other jobs can stop yours'].filter(Boolean).join('. ')
}
