// A compute node's size in style E, the desktop twin of the phone's NodeFields (mobile/src/parts/NodeSheet.tsx):
// Small CPU, Medium CPU or GPU, then Cores, Memory, Time and the queue as rows. Numbers are typed in place up to what
// the queue and priority allow. With a GPU, the GPU memory you need is typed too and the GPUs that fit are listed
// right here. Where each core comes with a set amount of memory (Wulver's GPU queue), more memory takes more cores.
// Queue opens its own window. NodeRow is the one row a tool window shows for it.
import { useEffect, useState } from 'react'

import { chosen, fitting, gpuName, isPreset, presets, useGpus, withGpu, type Gpu, type GpuFit } from '../clusters/gpus'
import { queueText } from '../clusters/priority'
import { QueuePickers } from '../clusters/queues'
import { human, minutes, slurmTime } from '../clusters/time'
import { call } from '../../rpc'
import { gpuText, type Limits, type Profile } from '../../types/clusters'
import { DurationRow, EDialog, Field, inRange, List, MainButton, NumberRow, Row, Section, Segments, Tick } from './ui'

export const profileText = (p: Profile) => [`${p.cpus} cores`, `${p.mem_gb} GB`, gpuText(p),
  human(minutes(p.time) ?? 240)].filter(Boolean).join(' · ')

function useLimits(cluster: string, p: Profile) {
  const [limits, setLimits] = useState<Limits | null>(null)
  useEffect(() => {
    const t = setTimeout(() => {
      call<Limits>('clusters.partitions', { cluster, partition: p.partition, qos: p.qos ?? '', account: p.account ?? '' })
        .then(setLimits).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [cluster, p.partition, p.qos, p.account])
  return limits
}

/** The fewest cores this much memory takes where each core comes with perCore GB. */
const coresFor = (mem: number, perCore?: number | null) => (perCore ? Math.max(1, Math.ceil(mem / perCore)) : 1)

const fits = (p: Profile, limits: Limits | null, g: Gpu | null) =>
  inRange(p.cpus, coresFor(p.mem_gb, limits?.mem_per_core_gb), limits?.cores) && inRange(p.mem_gb, 1, limits?.memory_gb)
  && inRange(minutes(p.time) ?? 0, 1, limits?.longest) && (!g || inRange(p.gpus ?? 1, 1, g.max_per_job))
  && (!g || limits?.gpu_caps?.[g.type] !== 0)

const fitName = (f: GpuFit) => (f.count === 1 ? gpuName(f.gpu) : `${f.count} × ${f.gpu.label}`)

/** GPU memory typed in, then the GPUs that give that much on one node; the first that fits is picked for you. */
function GpuPart({ gpus, limits, value: p, onChange }:
  { gpus: Gpu[]; limits: Limits | null; value: Profile; onChange: (p: Profile) => void }) {
  const g = chosen(p, gpus)
  const [need, setNeed] = useState(() => (g?.memory_gb ? g.memory_gb * (p.gpus || 1) : 16))
  const caps = limits?.gpu_caps ?? {}
  const fits = fitting(need, gpus, caps)
  const on = (f: GpuFit) => !!g && g.type === f.gpu.type && (p.gpus ?? 1) === f.count
  const changeNeed = (n: number) => {
    setNeed(n)
    const now = fitting(n, gpus, caps).filter((f) => !f.blocked)
    if (now.length && !now.some(on)) onChange(withGpu(p, now[0].gpu, now[0].count))
  }
  const most = Math.max(0, ...gpus.filter((x) => caps[x.type] !== 0)
    .map((x) => x.memory_gb * (x.slice ? 1 : Math.min(x.max_per_job, caps[''] ?? Infinity))))
  return (
    <Section title="GPU">
      <NumberRow label="GPU memory you need" unit="GB" value={need} max={most || null} onChange={changeNeed} />
      {fits.map((f) => (
        <Row key={`${f.gpu.type}-${f.count}`} label={fitName(f)}
          sub={f.blocked ? 'Not with this priority. Change it under Queue and priority'
            : f.count > 1 ? `${f.count * f.gpu.memory_gb} GB in all` : undefined}
          onPress={f.blocked ? undefined : () => onChange(withGpu(p, f.gpu, f.count))}>
          {!f.blocked && <Tick on={on(f)} />}</Row>
      ))}
    </Section>
  )
}

function QueueDialog({ limits, value: p, onChange, onClose, extra }:
  { limits: Limits | null; value: Profile; onChange: (p: Profile) => void; onClose: () => void; extra: boolean }) {
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  return (
    <EDialog title="Queue and priority" width={440} onClose={onClose}
      actions={<MainButton onClick={onClose}>Done</MainButton>}>
      <QueuePickers limits={limits} queue={p.partition} qos={p.qos ?? ''} onQueue={(partition) => set({ partition })}
        onQos={(qos) => set({ qos })} account={p.account ?? ''} onAccount={(account) => set({ account })} />
      <div className="px-5 pt-3">
        {extra && <Field label="Extra options" value={p.extra_args ?? ''} placeholder="--constraint=intel"
          onChange={(e) => set({ extra_args: e.target.value })} />}
      </div>
    </EDialog>
  )
}

/** onValid hears whether every number is allowed, so the window can turn its button off. extra: false where the
 *  extra options can't be kept (a request for a node now). */
export function NodeFields({ cluster, value: p, onChange, onValid, extra = true }: {
  cluster: string; value: Profile; onChange: (p: Profile) => void; onValid?: (ok: boolean) => void; extra?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { gpus } = useGpus(cluster)
  const limits = useLimits(cluster, p)
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  const g = chosen(p, gpus)
  const ok = fits(p, limits, g)
  useEffect(() => { onValid?.(ok) }, [ok, onValid])
  const perCore = limits?.mem_per_core_gb
  const fewest = coresFor(p.mem_gb, perCore)
  const quick = presets(gpus)
  // a queue where memory sets the cores (picked just now): raise them to what the memory takes
  useEffect(() => { if (p.cpus < fewest) onChange({ ...p, cpus: fewest }) }, [p, fewest, onChange])
  const on = quick.find((x) => isPreset(p, x))?.id ?? (p.gpus ? 'gpu' : '')  // GPU with cores raised still is GPU
  const queue = queueText(p.partition, p.qos)
  // a CPU size leaves a GPU-only queue for the usual one
  const gpuQueue = (q: Profile) => gpus.some((x) => x.partitions.includes(q.partition))
    && !(limits?.default_partition && gpus.some((x) => x.partitions.includes(limits.default_partition)))
  const pickSize = (id: string) => {
    const q = quick.find((x) => x.id === id)!.apply(p)
    onChange(!q.gpus && gpuQueue(q) ? { ...q, partition: limits?.default_partition ?? '' } : q)
  }
  return (
    <>
      <div className="px-5 pb-4">
        <Segments label="Size" value={on} options={quick.map((x) => [x.id, x.label] as const)} onChange={pickSize} />
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
      {!!p.gpus && gpus.length > 0 && <GpuPart gpus={gpus} limits={limits} value={p} onChange={onChange} />}
      {open && <QueueDialog limits={limits} value={p} onChange={onChange} extra={extra} onClose={() => setOpen(false)} />}
    </>
  )
}

/** The node a tool asks for, as one row with its size; click it to change the size in its own window. */
export function NodeRow({ cluster, label = 'Compute node', profile, onChange }:
  { cluster: string; label?: string; profile: Profile; onChange: (p: Profile) => void }) {
  const [open, setOpen] = useState(false)
  const [p, setP] = useState(profile)
  const [ok, setOk] = useState(true)
  return (
    <>
      <Row label={label} sub={profileText(profile)} opens onPress={() => { setP(profile); setOpen(true) }} />
      {open && <EDialog title={label} width={480} onClose={() => setOpen(false)}
        actions={<MainButton disabled={!ok} onClick={() => { onChange(p); setOpen(false) }}>Done</MainButton>}>
        <div className="pt-1"><NodeFields cluster={cluster} value={p} onChange={setP} onValid={setOk} /></div>
      </EDialog>}
    </>
  )
}
