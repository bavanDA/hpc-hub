// The compute node an agent or VS Code asks for, as one row: the node it runs on, or the size of the new one. Tap
// it and the size opens on its own screen with the same fields as the node screen (NodeSheet): cores, memory and
// time typed in place up to what the queue allows, the GPU with its types and slices, the queue and billing.
import { useState } from 'react'

import { useClusters } from '@shared/components/clusters/store'
import { human, minutes } from '@shared/components/clusters/time'
import { gpuText, type Profile } from '@shared/types/clusters'
import { MainButton, Row, Sheet } from '../../ui'
import { NodeFields } from '../NodeSheet'

export const profileText = (p: Profile) => [`${p.cpus} cores`, `${p.mem_gb} GB`, gpuText(p),
  human(minutes(p.time) ?? 240)].filter(Boolean).join(' · ')

/** node: the node it runs on (nothing to change). Otherwise a new one is asked for, at the size of profile. */
export function NodeRow({ cluster, node = '', label = 'New compute node', profile, onChange }: {
  cluster: string; node?: string; label?: string; profile?: Profile; onChange?: (p: Profile) => void
}) {
  const [open, setOpen] = useState(false)
  if (node || !profile) return <Row label="Compute node" value={node || 'Asked for when it starts'} />
  return (
    <>
      <Row label={label} sub={profileText(profile)} opens={Boolean(onChange)}
        onPress={onChange ? () => setOpen(true) : undefined} />
      {open && onChange && <SizeSheet cluster={cluster} value={profile} onChange={onChange}
        onClose={() => setOpen(false)} />}
    </>
  )
}

function SizeSheet({ cluster: id, value, onChange, onClose }:
  { cluster: string; value: Profile; onChange: (p: Profile) => void; onClose: () => void }) {
  const { clusters } = useClusters()
  const c = clusters?.find((x) => x.id === id)
  const [p, setP] = useState(value)
  const [ok, setOk] = useState(true)
  return (
    <Sheet title="Compute node" flush onClose={onClose}
      actions={<MainButton disabled={!ok} onClick={() => { onChange(p); onClose() }}>Done</MainButton>}>
      {c && <NodeFields cluster={c} value={p} onChange={setP} onValid={setOk} />}
    </Sheet>
  )
}
