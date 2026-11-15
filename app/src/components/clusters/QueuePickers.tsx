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
export function QueuePickers({ cluster, limits, queue, qos, onQueue, onQos, autoFocus, account, onAccount, only,
  hide }: {
  cluster?: string  // with it, each queue says what it allows, read from Slurm
  limits: Limits | null; queue: string; qos: string; onQueue: (q: string) => void; onQos: (q: string) => void
  autoFocus?: boolean
  account?: string; onAccount?: (a: string) => void  // with these, a Group to bill row too
  only?: string[]  // just these queues (a GPU size: the GPU queues)
  hide?: string[]  // never these (a CPU size: the GPU-only queues)
}) {
  const [pick, setPick] = useState<'' | 'queue' | 'priority' | 'group'>('')
  const [hidNow, setHidNow] = useState<string[] | null>(null)  // after Hide or Show here, before limits reload
  const [showHidden, setShowHidden] = useState(false)
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
  const hid = hidNow ?? limits?.hidden_accounts ?? []
  const known = [...(limits?.accounts ?? []), ...(limits?.hidden_accounts ?? [])]
  const listedGroups = known.filter((a, i) => known.indexOf(a) === i && (showHidden || !hid.includes(a)))
  const groups = onAccount ? choices(listedGroups, account ?? '') : []
  const def = limits?.default_account ?? ''
  const note = (a: string) => limits?.account_notes?.[a]
  const ended = account ? note(account) : undefined
  const setHidden = (a: string, hide: boolean) => {
    if (!cluster) return
    call<string[]>('clusters.hide_group', { cluster, account: a, hide }).then(setHidNow).catch(() => {})
    if (hide && a === account) onAccount?.('')  // back to your default group
  }
  const listed = (only?.length ? limits?.partitions?.filter((q) => only.includes(q)) : limits?.partitions)
    ?.filter((q) => !hide?.includes(q))
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
      {ended && account && <div className="flex items-center gap-3 px-5 pt-2 text-sm text-dim">
        <p className="min-w-0 flex-1">{`This course group's term is over (${ended.replace(/^Ended \(|\)$/g, '')}), `
          + 'so Slurm may refuse jobs billed to it.'}</p>
        {cluster && <EButton small onClick={() => setHidden(account, true)}>Hide this group</EButton>}
      </div>}
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
        top={hid.length ? <EButton small onClick={() => setShowHidden(!showHidden)}>
          {showHidden ? 'Leave out hidden groups' : `Show hidden groups (${hid.length})`}</EButton> : undefined}
        options={groups.map((a) => ({ value: a, label: groupName(a, def),
          hint: [note(a), hid.includes(a) ? 'Hidden' : ''].filter(Boolean).join(' · ') || undefined }))}
        onPick={(a) => { if (hid.includes(a)) setHidden(a, false); onAccount(a) }}  // picking a hidden one shows it again
        onClose={() => setPick('')} />}
      {pick === 'priority' && <PickDialog title="Priority" value={shownQos}
        options={levels.map((q) => ({ value: q, label: priorityName(q) }))} onPick={onQos}
        onClose={() => setPick('')} />}
    </>
  )
}
