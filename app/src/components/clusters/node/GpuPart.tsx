import { useState } from 'react'

import type { Limits, Profile } from '../../../types/clusters'
import { NumberRow, Row, Section } from '../../e/ui'
import { chosen, fitting, withGpu, type Gpu } from '../gpus'
import { fitName } from './fit'

/** GPU memory and the number of GPUs, both typed; the GPU that gives that much is picked for you and shown. */
export function GpuPart({ gpus, limits, value: p, onChange }:
  { gpus: Gpu[]; limits: Limits | null; value: Profile; onChange: (p: Profile) => void }) {
  const g = chosen(p, gpus)
  const [need, setNeed] = useState(() => (g?.memory_gb ? g.memory_gb * (p.gpus || 1) : 16))
  const caps = limits?.gpu_caps ?? {}
  const allowed = (x: Gpu) => caps[x.type] !== 0
  const most = (x: Gpu) => (x.slice ? 1 : Math.min(x.max_per_job || 1, caps[''] ?? Infinity))
  const biggest = Math.max(0, ...gpus.filter(allowed).map((x) => x.memory_gb * most(x)))
  const changeNeed = (n: number) => {
    setNeed(n)
    const best = fitting(n, gpus, caps).find((f) => !f.blocked)
    if (best) onChange(withGpu(p, best.gpu, best.count))
  }
  // more than one: a whole GPU, the one you have if it allows that many
  const wholes = gpus.filter((x) => !x.slice && allowed(x))
  const countMax = Math.max(1, ...wholes.map(most))
  const changeCount = (n: number) => {
    const x = (g && !g.slice && n <= most(g) ? g : null) ?? (n > 1 ? wholes.find((w) => n <= most(w)) : g)
    if (!x) return onChange({ ...p, gpus: n })
    onChange(withGpu(p, x, n))
    setNeed(x.memory_gb * n)
  }
  const blocked = fitting(need, gpus, caps).filter((f) => f.blocked).map((f) => f.gpu.label)
  return (
    <Section title="GPU">
      <NumberRow label="GPU memory you need" unit="GB" value={need} max={biggest || null} onChange={changeNeed} />
      <NumberRow label="GPUs" unit="GPUs" showUnit={false} value={p.gpus ?? 1} max={countMax}
        onChange={changeCount} />
      <Row label="You get" value={g ? fitName({ gpu: g, count: p.gpus ?? 1, blocked: false }) : 'None'}
        sub={blocked.length ? `${[...new Set(blocked)].join(', ')} needs another priority, under Queue and priority`
          : undefined} />
    </Section>
  )
}
