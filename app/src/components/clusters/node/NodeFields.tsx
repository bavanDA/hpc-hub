import { useContext, useEffect, useState } from 'react'

import type { Profile } from '../../../types/clusters'
import { DurationRow } from '../../e/DurationRow'
import { List } from '../../e/List'
import { NumberRow } from '../../e/NumberRow'
import { Row } from '../../e/Row'
import { Segments } from '../../e/Segments'
import { chosen, presets, withGpu } from '../gpus'
import { queueText } from '../priority'
import { suText } from '../su'
import { minutes, slurmTime } from '../time'
import { useGpus } from '../useGpus'
import { coresFor, fits, sizeOf } from './fit'
import { GpuPart } from './GpuPart'
import { keptFor, remember } from './kept'
import { MaintenanceNote } from './MaintenanceNote'
import { QueueWindow } from './QueueDialog'
import { askedKey, useLimits } from './useLimits'

/** onValid hears whether every number is allowed, so the window can turn its button off. extra: false where the
 *  extra options can't be kept (a request for a node now). now: this job goes to Slurm when the window closes, so
 *  say if it would run into maintenance. */
export function NodeFields({ cluster, value: p, onChange, onValid, extra = true, now = false }: {
  cluster: string; value: Profile; onChange: (p: Profile) => void; onValid?: (ok: boolean) => void; extra?: boolean
  now?: boolean
}) {
  const [open, setOpen] = useState(false)
  const Queue = useContext(QueueWindow)
  const { gpus } = useGpus(cluster)
  const limits = useLimits(cluster, p)
  const quick = presets(gpus)
  const [on, setOn] = useState(() => sizeOf(p, quick, keptFor(cluster).tab))
  const change = (q: Profile) => { remember(cluster, on, q); onChange(q) }
  const set = (c: Partial<Profile>) => change({ ...p, ...c })
  const g = chosen(p, gpus)
  const ok = fits(p, limits, g)
  useEffect(() => { onValid?.(ok) }, [ok, onValid])
  const perCore = limits?.mem_per_core_gb
  const fewest = coresFor(p.mem_gb, perCore)
  // a queue where memory sets the cores (picked just now): raise them to what the memory takes
  useEffect(() => { if (p.cpus < fewest) onChange({ ...p, cpus: fewest }) }, [p, fewest, onChange])
  // a partition that takes only some priorities (debug takes debug): switch to one it takes; qos_note says why
  const fix = limits?.asked === askedKey(p) ? limits.qos_fix : ''
  useEffect(() => {
    if (!fix || fix === p.qos) return
    onChange({ ...p, qos: fix })
  }, [fix, p, onChange])
  const refused = limits?.asked === askedKey(p) && !limits.qos_fix ? limits.qos_refused : ''
  // a queue of GPU nodes only refuses a job without a GPU: add one of the kind it has
  const gpuOnly = limits?.asked === askedKey(p) && !!limits.needs_gpu
  const queueGpu = gpus.find((x) => x.partitions.includes(p.partition)) ?? null
  useEffect(() => {
    if (gpuOnly && !p.gpus && queueGpu) onChange(withGpu(p, queueGpu))
  }, [gpuOnly, p, queueGpu, onChange])
  const queue = queueText(p.partition, p.qos)
  const su = limits?.billing ? suText(limits.billing, p, minutes(p.time) ?? 240, p.qos || limits.default_qos) : null
  // a CPU size leaves a GPU-only queue for the usual one
  const gpuQueue = (q: Profile) => gpus.some((x) => x.partitions.includes(q.partition))
    && !(limits?.default_partition && gpus.some((x) => x.partitions.includes(limits.default_partition)))
  const gpuQueues = [...new Set(gpus.flatMap((x) => x.partitions))]
  const pickSize = (id: string) => {
    if (id === on) return
    remember(cluster, on, p)
    const q = keptFor(cluster).sizes[id] ?? quick.find((x) => x.id === id)!.apply(p)
    remember(cluster, id, q)
    setOn(id)
    onChange(!q.gpus && gpuQueue(q) ? { ...q, partition: limits?.default_partition ?? '' } : q)
  }
  return (
    <>
      <div className="px-5 pb-4">
        <Segments label="Size" value={p.gpus && quick.some((x) => x.id === 'gpu') ? 'gpu' : on}
          options={quick.map((x) => [x.id, x.label] as const)} onChange={pickSize} />
      </div>
      <List>
        <NumberRow label="Cores" unit="cores" showUnit={false} value={p.cpus} min={fewest} max={limits?.cores}
          note={fewest > 1 ? `At least ${fewest} for ${p.mem_gb} GB of memory here` : undefined}
          onChange={(n) => set({ cpus: n })} />
        <NumberRow label="Memory" unit="GB" value={p.mem_gb} max={limits?.memory_gb}
          note={perCore ? `Each core comes with up to ${+perCore.toFixed(1)} GB here, so more memory adds cores` : undefined}
          onChange={(n) => set({ mem_gb: n, cpus: Math.max(p.cpus, coresFor(n, perCore)) })} />
        <DurationRow label="Time" minutes={minutes(p.time) ?? 240} max={limits?.longest}
          onChange={(m) => set({ time: slurmTime(Math.max(1, m)) })} />
        <Row label="Queue and priority" value={queue} opens onPress={() => setOpen(true)} />
      </List>
      {refused && <p role="alert" className="px-5 pb-3 text-sm font-semibold text-bad">{refused} Pick another queue.</p>}
      {!refused && limits?.qos_note && <p className="px-5 pb-3 text-sm text-dim">{limits.qos_note}</p>}
      {gpuOnly && (p.gpus
        ? <p className="px-5 pb-3 text-sm text-dim">The {p.partition} queue is for GPU jobs, so this asks for a GPU.</p>
        : <p role="alert" className="px-5 pb-3 text-sm font-semibold text-bad">The {p.partition} queue is for GPU jobs.
          Pick the GPU size, or another queue.</p>)}
      {now && <MaintenanceNote cluster={cluster} asked={minutes(p.time) ?? 240}
        onShorten={(m) => set({ time: slurmTime(m) })} />}
      {!!p.gpus && gpus.length > 0 && <GpuPart gpus={gpus} limits={limits} value={p} onChange={change} />}
      {su && <List><Row label="Cost" sub={su.sub} value={su.value} /></List>}
      {open && <Queue cluster={cluster} limits={limits} value={p} onChange={change} extra={extra}
        only={p.gpus ? gpuQueues : undefined} hide={p.gpus ? undefined : limits?.gpu_queues}
        onClose={() => setOpen(false)} />}
    </>
  )
}
