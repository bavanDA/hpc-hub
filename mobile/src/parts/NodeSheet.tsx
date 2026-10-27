// Ask Slurm for a compute node: your saved cores, memory and time, changed for this once or saved.
import { useState } from 'react'

import { call } from '@shared/rpc'
import type { Cluster, Profile } from '@shared/types/clusters'
import { Button, Field, Sheet, Switch, useToast } from '../ui'

export function NodeSheet({ cluster: c, onClose }: { cluster: Cluster; onClose: () => void }) {
  const toast = useToast()
  const [p, setP] = useState<Profile>(c.profile)
  const [remember, setRemember] = useState(false)
  const set = (change: Partial<Profile>) => setP({ ...p, ...change })

  function request() {
    call('clusters.request_node', { cluster: c.id, profile: p, remember }).catch((e: Error) => toast(e.message))
    onClose()
  }

  return (
    <Sheet title={`Compute node on ${c.name}`} onClose={onClose} actions={<>
      <Button className="flex-1" onClick={onClose}>Cancel</Button>
      <Button kind="primary" className="flex-1" onClick={request}>Request</Button></>}>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Cores" inputMode="numeric" value={p.cpus} onChange={(e) => set({ cpus: Number(e.target.value) || 1 })} />
        <Field label="Memory (GB)" inputMode="numeric" value={p.mem_gb}
          onChange={(e) => set({ mem_gb: Number(e.target.value) || 1 })} />
        <Field label="Time" value={p.time} onChange={(e) => set({ time: e.target.value })} placeholder="04:00:00" />
        <Field label="Partition" autoCapitalize="none" value={p.partition}
          onChange={(e) => set({ partition: e.target.value })} />
      </div>
      <Switch label="Save as my default" checked={remember} onChange={setRemember} />
    </Sheet>
  )
}
