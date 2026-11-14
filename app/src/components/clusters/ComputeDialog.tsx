import { useEffect, useState } from 'react'

import { call, type CallError } from '../../rpc'
import { summary, type Cluster, type Profile } from '../../types/clusters'
import { ConfirmDialog } from '../e/ConfirmDialog'
import { EDialog } from '../e/EDialog'
import { MainButton } from '../e/MainButton'
import { ToggleRow } from '../e/ToggleRow'
import { Spinner } from '../ui/Spinner'
import { useToast } from '../useToast'
import { shortName } from './loginCopy'
import { NodeFields } from './node/NodeFields'
import { putCluster } from './store'

type Waiting = { job: string; reason: string }

export const ASK = 'Ask before each request'
const ASK_SUB = 'Shows this window when you connect.'

export function ComputeDialog({ cluster: c, onClose }: { cluster: Cluster; onClose: () => void }) {
  const toast = useToast()
  const [p, setP] = useState<Profile>({ ...c.profile, account: c.profile.account ?? '', qos: c.profile.qos ?? '' })
  const [ask, setAsk] = useState(c.ask_node ?? false)
  const [remember, setRemember] = useState(true)
  const [sending, setSending] = useState(false)
  const [ok, setOk] = useState(true)
  const [waiting, setWaiting] = useState<Waiting | null>(null)  // a request still in the queue: keep it or cancel
  const [checking, setChecking] = useState(true)  // asks first whether one waits: never a second request

  useEffect(() => {
    let live = true
    call<Waiting | null>('clusters.waiting_node', { cluster: c.id })
      .then((w) => { if (live && w) setWaiting(w) })
      .catch(() => {})  // can't tell: the form, and Get node checks again
      .finally(() => live && setChecking(false))
    return () => { live = false }
  }, [c.id])

  async function go() {
    const profile: Profile = { cpus: p.cpus, mem_gb: p.mem_gb, gpus: p.gpus ?? 0, gpu_type: p.gpu_type ?? '',
      time: p.time, partition: p.partition.trim(), account: (p.account ?? '').trim(), qos: (p.qos ?? '').trim() }
    setSending(true)
    try {
      if (ask !== (c.ask_node ?? false)) {
        putCluster(await call<Cluster>('clusters.update', { cluster: c.id, changes: { ask_node: ask } }))
      }
      await call('clusters.request_node', { cluster: c.id, profile, remember })
      if (remember) putCluster({ ...c, profile: { ...c.profile, ...profile }, ask_node: ask })
      onClose()
    } catch (e) {
      if ((e as CallError).kind === 'already-waiting') {
        const w = await call<Waiting | null>('clusters.waiting_node', { cluster: c.id }).catch(() => null)
        if (w) { setWaiting(w); setSending(false); return }
      }
      toast((e as Error).message)
      setSending(false)
    }
  }

  async function keepWaiting() {
    try {
      await call('clusters.request_node', { cluster: c.id, keep_waiting: true })
      onClose()
    } catch (e) { toast((e as Error).message) }
  }

  async function cancelWaiting(job: string) {
    try {
      await call('clusters.cancel_waiting', { cluster: c.id, job })
      toast(`Cancelled job ${job}. You can ask for a node again.`)
    } catch (e) { toast((e as Error).message) }
  }

  const question = waiting && <ConfirmDialog title={`You already asked for a node on ${shortName(c)}`}
    text={<><p>Job {waiting.job} is still waiting in the queue
      {waiting.reason ? ` (Slurm says: ${waiting.reason})` : ''}. Asking again would put a second job in the
      queue.</p><p>Keep waiting for it, or cancel it and ask again.</p></>}
    keep="Keep waiting" confirm="Cancel it" danger onKeep={keepWaiting}
    onConfirm={() => void cancelWaiting(waiting.job)} onClose={() => setWaiting(null)} />

  if (checking || (waiting && !sending)) {  // the question comes first, alone; Cancel it leads to the form
    return checking
      ? <EDialog title={`Get a node on ${shortName(c)}`} onClose={onClose}>
          <div className="flex items-center gap-3 px-5 pb-6 text-dim"><Spinner />Looking at the queue…</div>
        </EDialog>
      : <>{question}</>
  }

  return (
    <EDialog title={`Get a node on ${shortName(c)}`} onClose={onClose}
      actions={<MainButton disabled={sending || !ok} onClick={go}>Get node</MainButton>}>
      <div className="pt-1">
        <NodeFields cluster={c.id} value={p} onChange={setP} onValid={setOk} extra={false} now /></div>
      <ToggleRow label="Use this size next time" checked={remember}
        sub={remember ? undefined : `Next time: ${summary(c.profile)}`} onChange={setRemember} />
      <ToggleRow label={ASK} sub={ASK_SUB} checked={ask} onChange={setAsk} />
    </EDialog>
  )
}
