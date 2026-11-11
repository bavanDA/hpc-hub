import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Limits } from '../../types/clusters'
import type { Guide } from '../../types/usage'
import { EButton } from '../e/EButton'
import { EDialog } from '../e/EDialog'
import { Field } from '../e/Field'
import { List } from '../e/List'
import { PickDialog } from '../e/PickDialog'
import { Row } from '../e/Row'
import { LimitsTab } from '../usage/LimitsTab'
import { queueHint } from './node/queueLine'
import { groupName, priorityName } from './priority'

/** The cluster's list, with the current value kept when the cluster doesn't list it. */
const choices = (list: string[] | undefined, current: string) =>
  list?.length ? [...(current && !list.includes(current) ? [current] : []), ...list] : []

/** A Queue row and a Priority row, each opening the cluster's list; text fields while the lists aren't known. */
export function QueuePickers({ cluster, limits, queue, qos, onQueue, onQos, autoFocus, account, onAccount, only }: {
  cluster?: string  // with it, each queue says what it allows, read from Slurm
  limits: Limits | null; queue: string; qos: string; onQueue: (q: string) => void; onQos: (q: string) => void
  autoFocus?: boolean
  account?: string; onAccount?: (a: string) => void  // with these, a Group to bill row too
  only?: string[]  // just these queues (a GPU size: the GPU queues)
}) {
  const [pick, setPick] = useState<'' | 'queue' | 'priority' | 'group'>('')
  const [guide, setGuide] = useState<Guide | null>(null)
  const [guideError, setGuideError] = useState('')
  const [learn, setLearn] = useState(false)
  useEffect(() => {
    if (pick !== 'queue' || !cluster || guide) return
    call<Guide>('clusters.limits', { cluster }).then(setGuide).catch((e: Error) => setGuideError(e.message))
  }, [pick, cluster, guide])
  const about = (q: string) => {
    const found = guide?.queues.find((x) => x.name === q)
    return found && queueHint(found)
  }
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
      {pick === 'queue' && !learn && <PickDialog title="Queue" value={shownQueue} width={cluster ? 560 : 420}
        top={cluster ? <EButton onClick={() => setLearn(true)}>Learn about queues</EButton> : undefined}
        options={queues.map((q) => ({ value: q, label: q, hint: about(q) }))} onPick={onQueue}
        onClose={() => setPick('')} />}
      {learn && <EDialog title="Queues" width={1000} onBack={() => setLearn(false)}
        onClose={() => { setLearn(false); setPick('') }}>
        <LimitsTab guide={guide} error={guideError} />
      </EDialog>}
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
