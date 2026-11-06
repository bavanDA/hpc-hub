import { useState } from 'react'

import { call } from '../../rpc'
import { summary, type Cluster, type Profile } from '../../types/clusters'
import { EDialog } from '../e/EDialog'
import { MainButton } from '../e/MainButton'
import { ToggleRow } from '../e/ToggleRow'
import { useToast } from '../useToast'
import { shortName } from './loginCopy'
import { NodeFields } from './node/NodeFields'
import { putCluster } from './store'

export const ASK = 'Ask before each request'
const ASK_SUB = 'Shows this window when you connect.'

export function ComputeDialog({ cluster: c, onClose }: { cluster: Cluster; onClose: () => void }) {
  const toast = useToast()
  const [p, setP] = useState<Profile>({ ...c.profile, account: c.profile.account ?? '', qos: c.profile.qos ?? '' })
  const [ask, setAsk] = useState(c.ask_node ?? false)
  const [remember, setRemember] = useState(true)
  const [sending, setSending] = useState(false)
  const [ok, setOk] = useState(true)

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
      toast((e as Error).message)
      setSending(false)
    }
  }

  return (
    <EDialog title={`Get a node on ${shortName(c)}`} onClose={onClose}
      actions={<MainButton disabled={sending || !ok} onClick={go}>Get node</MainButton>}>
      <div className="pt-1">
        <NodeFields cluster={c.id} value={p} onChange={setP} onValid={setOk} extra={false} /></div>
      <ToggleRow label="Use this size next time" checked={remember}
        sub={remember ? undefined : `Next time: ${summary(c.profile)}`} onChange={setRemember} />
      <ToggleRow label={ASK} sub={ASK_SUB} checked={ask} onChange={setAsk} />
    </EDialog>
  )
}
