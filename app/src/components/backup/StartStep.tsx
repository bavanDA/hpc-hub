import { useState } from 'react'

import type { BackupPolicy, Scan } from '../../types/backup'
import { agentIcon } from '../agents/AgentIcon'
import { EButton } from '../e/EButton'
import { IconToggleRow } from '../e/IconToggleRow'
import { List } from '../e/List'
import { Row } from '../e/Row'
import { Spinner } from '../ui/Spinner'
import { Actions } from './Actions'
import { start } from './copy'

export function StartStep({ name, policy, last, busy, onCheck, onLast }: {
  name: string; policy: BackupPolicy | null; last: Scan | null; busy: boolean
  onCheck: (everything: boolean, agent: string) => void; onLast: () => void
}) {
  const [agent, setAgent] = useState(true)
  const days = policy?.purge.days ?? 0
  const noTimer = !!policy && days <= 0
  return (
    <>
      <p className="px-5 pb-5 text-md">{!policy ? <Spinner /> : noTimer ? start.noTimer(name) : start.intro(name, days)}</p>
      <List>
        <IconToggleRow icon={agentIcon('claude')} label={start.agent} sub={start.agentHint} checked={agent}
          onChange={setAgent} />
        {last?.state === 'done' && <Row label={start.seeLast} opens onPress={onLast} />}
      </List>
      <p className="px-5 pt-2 text-sm text-dim">{start.hint}</p>
      <Actions>
        <EButton kind="primary" disabled={busy || !policy} onClick={() => onCheck(noTimer, agent ? 'claude' : '')}>
          {noTimer ? start.anyway : start.check}</EButton>
      </Actions>
    </>
  )
}
