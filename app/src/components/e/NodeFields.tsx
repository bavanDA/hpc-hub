// A compute node's size in style E, the desktop twin of the phone's NodeFields (mobile/src/parts/NodeSheet.tsx):
// Small CPU, Medium CPU or GPU, then Cores, Memory, Time and the queue as rows. Numbers are typed in place up to what
// the queue and priority allow. With a GPU, the GPU memory you need and how many are typed too, and the GPU that
// gives that much is picked and shown. Where each core comes with a set amount of memory (Wulver's GPU queue), more memory takes more cores.
// Queue opens its own window. Cost says what it takes in SUs, from Slurm's billing weights. NodeRow is the one row
// a tool window shows for it.
import { useEffect, useState } from 'react'

import { chosen, fitting, gpuName, isPreset, presets, useGpus, withGpu, type Gpu, type GpuFit, type Preset } from '../clusters/gpus'
import { queueText } from '../clusters/priority'
import { suText } from '../clusters/su'
import { QueuePickers } from '../clusters/QueuePickers'
import { human, minutes, slurmTime } from '../clusters/time'
import { call } from '../../rpc'
import { gpuText, type Limits, type Profile } from '../../types/clusters'
import { DurationRow, EDialog, Field, inRange, List, MainButton, NumberRow, Row, Section, Segments } from './ui'

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

/** Each size's own settings per cluster, so going to GPU and back leaves Small as you left it. */
const kept = new Map<string, { tab: string; sizes: Record<string, Profile> }>()
const keptFor = (cluster: string) => kept.get(cluster) ?? kept.set(cluster, { tab: '', sizes: {} }).get(cluster)!
const remember = (cluster: string, tab: string, p: Profile) => {
  const k = keptFor(cluster)
  k.sizes[tab] = p
  k.tab = tab
}

const sizeOf = (p: Profile, quick: Preset[], last?: string) =>
  (last && (last === 'gpu') === !!p.gpus ? last : null)
  ?? quick.find((x) => isPreset(p, x))?.id
  ?? (p.gpus ? 'gpu' : p.cpus >= 8 ? 'medium' : 'small')

const fitName = (f: GpuFit) =>
  (f.count === 1 ? gpuName(f.gpu) : `${f.count} × ${f.gpu.label}, ${f.count * f.gpu.memory_gb} GB`)

/** GPU memory and the number of GPUs, both typed; the GPU that gives that much is picked for you and shown. */
function GpuPart({ gpus, limits, value: p, onChange }:
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

function QueueDialog({ limits, value: p, onChange, onClose, extra, only }: {
  limits: Limits | null; value: Profile; onChange: (p: Profile) => void; onClose: () => void; extra: boolean
  only?: string[]
}) {
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  return (
    <EDialog title="Queue and priority" width={440} onClose={onClose}
      actions={<MainButton onClick={onClose}>Done</MainButton>}>
      <QueuePickers limits={limits} queue={p.partition} qos={p.qos ?? ''} onQueue={(partition) => set({ partition })}
        only={only}
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
      {!!p.gpus && gpus.length > 0 && <GpuPart gpus={gpus} limits={limits} value={p} onChange={change} />}
      {su && <List><Row label="Cost" sub={su.sub} value={su.value} /></List>}
      {open && <QueueDialog limits={limits} value={p} onChange={change} extra={extra}
        only={p.gpus ? gpuQueues : undefined} onClose={() => setOpen(false)} />}
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
