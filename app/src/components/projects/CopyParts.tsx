import type { CopyPlan } from '../../types/projects'
import { CheckRow } from '../e/extra'
import { List } from '../e/ui'
import { size } from '../files/format'
import { CopyStep } from './CopyStep'
import { NOTE } from './noteClass'

type Props = { plan: CopyPlan | null; keep: Record<string, boolean>; onKeep: (keep: Record<string, boolean>) => void
  note: string }

export function CopyParts({ plan, keep, onKeep, note }: Props) {
  return (
    <CopyStep title="What to take">
      <List>
        {plan?.parts.map((x) => (
          <CheckRow key={x.name} label={x.name} value={size(x.size)} checked={!!keep[x.name]}
            onChange={(v) => onKeep({ ...keep, [x.name]: v })} />
        ))}
      </List>
      <p className={NOTE}>{note}</p>
    </CopyStep>
  )
}
