import type { Cluster } from '../../types'
import type { Partition } from '../../types/usage'
import { shortName } from '../clusters/loginCopy'
import { fullName, queueText } from './summary'
import type { Answer } from './useEach'
import type { OpenView } from './view'

export function Queues({ shown, load, onOpen }: { shown: Cluster[]; load: (id: string) => Answer<Partition[]>; onOpen: OpenView }) {
  if (!shown.length) return null
  return (
    <p className="text-sm text-dim">
      Queues now:{' '}
      {shown.map((c, i) => {
        const got = load(c.id)
        const text = got.data ? queueText(got.data) : got.error ? 'not read' : '…'
        return (
          <span key={c.id}>{i > 0 && ' · '}
            <button onClick={() => onOpen(c.id, 'load')} title={`Open queues on ${fullName(c)}`}
              className="hover:text-text hover:underline">{shortName(c)} {text}</button>
          </span>
        )
      })}
    </p>
  )
}
