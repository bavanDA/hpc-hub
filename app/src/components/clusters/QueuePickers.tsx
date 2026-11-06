import { useState } from 'react'

import type { Limits } from '../../types/clusters'
import { PickDialog } from '../e/extra'
import { Field, List, Row } from '../e/ui'
import { groupName, priorityName } from './priority'

/** The cluster's list, with the current value kept when the cluster doesn't list it. */
const choices = (list: string[] | undefined, current: string) =>
  list?.length ? [...(current && !list.includes(current) ? [current] : []), ...list] : []

/** A Queue row and a Priority row, each opening the cluster's list; text fields while the lists aren't known. */
export function QueuePickers({ limits, queue, qos, onQueue, onQos, autoFocus, account, onAccount, only }: {
  limits: Limits | null; queue: string; qos: string; onQueue: (q: string) => void; onQos: (q: string) => void
  autoFocus?: boolean
  account?: string; onAccount?: (a: string) => void  // with these, a Group to bill row too
  only?: string[]  // just these queues (a GPU size: the GPU queues)
}) {
  const [pick, setPick] = useState<'' | 'queue' | 'priority' | 'group'>('')
  const groups = onAccount ? choices(limits?.accounts, account ?? '') : []
  const def = limits?.default_account ?? ''
  const listed = only?.length ? limits?.partitions?.filter((q) => only.includes(q)) : limits?.partitions
  const queues = choices(listed, queue)
  const levels = choices(limits?.qos, qos)
  const shownQueue = queue || limits?.default_partition || ''
  const shownQos = qos || limits?.default_qos || ''
  return (
    <>
      {(queues.length > 0 || levels.length > 0) && <List>
        {queues.length > 0 && <Row label="Queue" value={shownQueue || 'Default'} opens
          onPress={() => setPick('queue')} />}
        {levels.length > 0 && <Row label="Priority" value={priorityName(shownQos)} opens
          onPress={() => setPick('priority')} />}
        {groups.length > 0 && <Row label="Group to bill" value={groupName(account, def)} opens
          onPress={() => setPick('group')} />}
      </List>}
      {onAccount && !groups.length && <div className="px-5 pt-1">
        <Field label="Group to bill" value={account ?? ''} placeholder="Your default group"
          onChange={(e) => onAccount(e.target.value.trim())} />
      </div>}
      {(!queues.length || !levels.length) && <div className="px-5 pt-1">
        {!queues.length && <Field label="Queue" value={queue} autoFocus={autoFocus} placeholder="Default"
          onChange={(e) => onQueue(e.target.value.trim())} />}
        {!levels.length && <Field label="Priority" value={qos} placeholder="Default"
          onChange={(e) => onQos(e.target.value.trim())} />}
      </div>}
      {pick === 'queue' && <PickDialog title="Queue" value={shownQueue}
        options={queues.map((q) => ({ value: q, label: q }))} onPick={onQueue} onClose={() => setPick('')} />}
      {pick === 'group' && onAccount && <PickDialog title="Group to bill" value={account || def}
        options={groups.map((a) => ({ value: a, label: groupName(a, def) }))}
        onPick={onAccount}
        onClose={() => setPick('')} />}
      {pick === 'priority' && <PickDialog title="Priority" value={shownQos}
        options={levels.map((q) => ({ value: q, label: priorityName(q) }))} onPick={onQos}
        onClose={() => setPick('')} />}
    </>
  )
}
