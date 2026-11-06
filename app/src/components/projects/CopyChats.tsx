import type { CopyPlan } from '../../types/projects'
import { CheckRow } from '../e/CheckRow'
import { List } from '../e/List'
import { ToggleRow } from '../e/ToggleRow'
import { size } from '../files/format'
import { CopyStep } from './CopyStep'
import { NOTE } from './noteClass'

type Props = { plan: CopyPlan; chats: Record<string, boolean>; onChats: (chats: Record<string, boolean>) => void }

export function CopyChats({ plan, chats, onChats }: Props) {
  const picked = plan.chats.filter((c) => chats[c.id])
  const all = picked.length > 0 && picked.length === plan.chats.length
  return (
    <CopyStep title="Claude chats">
      <List>
        {plan.chats.length > 1 && <ToggleRow label="All of them" checked={all}
          onChange={(on) => onChats(Object.fromEntries(plan.chats.map((c) => [c.id, on])))} />}
        {plan.chats.map((c) => (
          <CheckRow key={c.id} label={c.name} value={size(c.size)} checked={!!chats[c.id]}
            onChange={(v) => onChats({ ...chats, [c.id]: v })} />
        ))}
      </List>
      <p className={NOTE}>{plan.chats_error ? `Could not read chats: ${plan.chats_error}`
        : 'Tick the ones to keep going there.'}</p>
    </CopyStep>
  )
}
