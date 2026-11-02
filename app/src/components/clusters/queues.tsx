// The queue and its priority (Slurm's QoS), both picked from the cluster's own lists (clusters.partitions); typed
// only before the first connect.
import { useState } from 'react'

import type { Limits } from '../../types/clusters'
import { PickerDialog } from '../e/parts'
import { Field, List, Row } from '../e/ui'
import { groupName, priorityName } from './priority'

/** The cluster's list, with the current value kept when the cluster doesn't list it. */
const choices = (list: string[] | undefined, current: string) =>
  list?.length ? [...(current && !list.includes(current) ? [current] : []), ...list] : []

/** A Queue row and a Priority row, each opening the cluster's list; text fields while the lists aren't known. */
export function QueuePickers({ limits, queue, qos, onQueue, onQos, autoFocus, account, onAccount }: {
  limits: Limits | null; queue: string; qos: string; onQueue: (q: string) => void; onQos: (q: string) => void
  autoFocus?: boolean
  account?: string; onAccount?: (a: string) => void  // with these, a Group to bill row too
}) {
  const [pick, setPick] = useState<'' | 'queue' | 'priority' | 'group'>('')
  const groups = onAccount ? choices(limits?.accounts, account ?? '') : []
  const def = limits?.default_account ?? ''
  const queues = choices(limits?.partitions, queue)
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
      {pick === 'queue' && <PickerDialog title="Queue" value={shownQueue}
        options={queues.map((q) => ({ value: q, label: q }))} onPick={onQueue} onClose={() => setPick('')} />}
      {pick === 'group' && onAccount && <PickerDialog title="Group to bill" value={account || def}
        options={groups.map((a) => ({ value: a, label: groupName(a, def) }))}
        onPick={onAccount}
        onClose={() => setPick('')} />}
      {pick === 'priority' && <PickerDialog title="Priority" value={shownQos}
        options={levels.map((q) => ({ value: q, label: priorityName(q) }))} onPick={onQos}
        onClose={() => setPick('')} />}
    </>
  )
}
