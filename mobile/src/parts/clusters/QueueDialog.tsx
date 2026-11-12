// The desktop's Queue and priority window (components/clusters/QueuePickers.tsx), with the phone's windows so Android's
// Back closes them one at a time: each queue says what it allows, and Learn about queues opens the same guide on one
// narrow column.
import { useEffect, useState, type ComponentProps } from 'react'

import { QueueDialog as DesktopQueueDialog } from '@shared/components/clusters/node/QueueDialog'
import { queueHint } from '@shared/components/clusters/node/queueLine'
import { groupName, priorityName } from '@shared/components/clusters/priority'
import { call } from '@shared/rpc'
import type { Guide } from '@shared/types/usage'
import { Button, Dialog, Field, List, MainButton, PickDialog, Row } from '../../ui'
import { QueueGuide } from './QueueGuide'

const choices = (list: string[] | undefined, current: string) =>
  list?.length ? [...(current && !list.includes(current) ? [current] : []), ...list] : []

export function QueueDialog({ cluster, limits, value: p, onChange, onClose, extra, only, hide }:
  ComponentProps<typeof DesktopQueueDialog>) {
  const set = (change: Partial<typeof p>) => onChange({ ...p, ...change })
  const [pick, setPick] = useState<'' | 'queue' | 'priority' | 'group'>('')
  const [learn, setLearn] = useState(false)
  const [guide, setGuide] = useState<Guide | null>(null)
  const [guideError, setGuideError] = useState('')
  useEffect(() => {
    if (pick !== 'queue' || guide) return
    call<Guide>('clusters.limits', { cluster }).then(setGuide).catch((e: Error) => setGuideError(e.message))
  }, [pick, cluster, guide])
  const about = (q: string) => {
    const found = guide?.queues.find((x) => x.name === q)
    return found && queueHint(found)
  }
  const def = limits?.default_account ?? ''
  const account = p.account ?? ''
  const qos = p.qos ?? ''
  const groups = choices(limits?.accounts, account)
  const listed = (only?.length ? limits?.partitions?.filter((q) => only.includes(q)) : limits?.partitions)
    ?.filter((q) => !hide?.includes(q))  // a CPU size: no GPU-only queues
  const queues = choices(listed, p.partition)
  const levels = choices(limits?.qos, qos)
  const shownQueue = p.partition || limits?.default_partition || ''
  const shownQos = qos || limits?.default_qos || ''
  return (
    <Dialog title="Queue and priority" onClose={onClose} actions={<MainButton onClick={onClose}>Done</MainButton>}>
      {(queues.length > 0 || levels.length > 0) && <List>
        {queues.length > 0 && <Row label="Queue" value={shownQueue || 'Default'} opens onPress={() => setPick('queue')} />}
        {levels.length > 0 && <Row label="Priority" value={priorityName(shownQos)} opens
          onPress={() => setPick('priority')} />}
        {groups.length > 0 && <Row label="Group to bill" value={groupName(account, def)} opens
          onPress={() => setPick('group')} />}
      </List>}
      <div className="px-5 pt-3">
        {!groups.length && <Field label="Group to bill" value={account} placeholder="Your default group"
          onChange={(e) => set({ account: e.target.value.trim() })} />}
        {!queues.length && <Field label="Queue" value={p.partition} placeholder="Default"
          onChange={(e) => set({ partition: e.target.value.trim() })} />}
        {!levels.length && <Field label="Priority" value={qos} placeholder="Default"
          onChange={(e) => set({ qos: e.target.value.trim() })} />}
        {extra && <Field label="Extra options" value={p.extra_args ?? ''} placeholder="--constraint=intel"
          onChange={(e) => set({ extra_args: e.target.value })} />}
      </div>
      {pick === 'queue' && !learn && <PickDialog title="Queue" value={shownQueue}
        top={<Button onClick={() => setLearn(true)}>Learn about queues</Button>}
        options={queues.map((q) => ({ value: q, label: q, hint: about(q) }))}
        onPick={(partition) => set({ partition })} onClose={() => setPick('')} />}
      {learn && <Dialog title="Queues" onBack={() => setLearn(false)} onClose={() => { setLearn(false); setPick('') }}>
        <QueueGuide guide={guide} error={guideError} />
      </Dialog>}
      {pick === 'group' && <PickDialog title="Group to bill" value={account || def}
        options={groups.map((a) => ({ value: a, label: groupName(a, def) }))}
        onPick={(a) => set({ account: a })} onClose={() => setPick('')} />}
      {pick === 'priority' && <PickDialog title="Priority" value={shownQos}
        options={levels.map((q) => ({ value: q, label: priorityName(q) }))}
        onPick={(q) => set({ qos: q })} onClose={() => setPick('')} />}
    </Dialog>
  )
}
