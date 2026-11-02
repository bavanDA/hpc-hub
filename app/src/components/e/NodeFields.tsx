// A compute node's size in style E, the desktop twin of the phone's NodeFields (mobile/src/parts/NodeSheet.tsx):
// quick sizes, then Cores, Memory, GPU, Time and the queue as rows. Numbers are typed in place up to what the queue
// allows; GPU and Queue open their own windows. NodeRow is the one row a tool window shows for it.
import { useEffect, useState } from 'react'

import { chosen, gpuName, gpuSummary, isPreset, presets, useGpus, withGpu, type Gpu } from '../clusters/gpus'
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
      call<Limits>('clusters.partitions', { cluster, partition: p.partition, qos: p.qos ?? '' })
        .then(setLimits).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [cluster, p.partition, p.qos])
  return limits
}

const fits = (p: Profile, limits: Limits | null, g: Gpu | null) =>
  inRange(p.cpus, 1, limits?.cores) && inRange(p.mem_gb, 1, limits?.memory_gb)
  && inRange(minutes(p.time) ?? 0, 1, limits?.longest) && (!g || inRange(p.gpus ?? 1, 1, g.max_per_job))

function GpuDialog({ gpus, value: p, onChange, onClose }:
  { gpus: Gpu[]; value: Profile; onChange: (p: Profile) => void; onClose: () => void }) {
  const g = chosen(p, gpus)
  const ok = !g || inRange(p.gpus ?? 1, 1, g.max_per_job)
  return (
    <EDialog title="GPU" width={440} onClose={onClose}
      actions={<MainButton disabled={!ok} onClick={onClose}>Done</MainButton>}>
      <List>
        <Row label="No GPU" onPress={() => onChange(withGpu(p, null))}><Tick on={!p.gpus} /></Row>
        {gpus.map((x) => (
          <Row key={x.type || 'any'} label={gpuName(x)} onPress={() => onChange(withGpu(p, x, p.gpus || 1))}>
            <Tick on={!!g && g.type === x.type} /></Row>
        ))}
      </List>
      {g && !g.slice && g.max_per_job > 1 && <Section>
        <NumberRow label="How many" unit={p.gpus === 1 ? 'GPU' : 'GPUs'} value={p.gpus ?? 1} max={g.max_per_job}
          onChange={(n) => onChange({ ...p, gpus: n })} />
      </Section>}
    </EDialog>
  )
}

function QueueDialog({ limits, value: p, onChange, onClose, extra }:
  { limits: Limits | null; value: Profile; onChange: (p: Profile) => void; onClose: () => void; extra: boolean }) {
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  return (
    <EDialog title="Queue and priority" width={440} onClose={onClose}
      actions={<MainButton onClick={onClose}>Done</MainButton>}>
      <QueuePickers limits={limits} queue={p.partition} qos={p.qos ?? ''} onQueue={(partition) => set({ partition })}
        onQos={(qos) => set({ qos })} />
      <div className="px-5 pt-3">
        <Field label="Group to bill" value={p.account ?? ''} placeholder="Your default group"
          onChange={(e) => set({ account: e.target.value.trim() })} />
        {extra && <Field label="Extra options" value={p.extra_args ?? ''} placeholder="--constraint=intel"
          onChange={(e) => set({ extra_args: e.target.value })} />}
      </div>
    </EDialog>
  )
}

const quickLabel = (x: { id: string; label: string; hint: string }) => x.id === 'gpu' && x.label === '1 GPU'
  ? `1 × ${x.hint.split(',')[0].replace(/^(NVIDIA|RTX|Tesla) /, '')}` : x.label

/** onValid hears whether every number is allowed, so the window can turn its button off. extra: false where the
 *  extra options can't be kept (a request for a node now). */
export function NodeFields({ cluster, value: p, onChange, onValid, extra = true }: {
  cluster: string; value: Profile; onChange: (p: Profile) => void; onValid?: (ok: boolean) => void; extra?: boolean
}) {
  const [open, setOpen] = useState<'' | 'gpu' | 'queue'>('')
  const { gpus } = useGpus(cluster)
  const limits = useLimits(cluster, p)
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  const g = chosen(p, gpus)
  const ok = fits(p, limits, g)
  useEffect(() => { onValid?.(ok) }, [ok, onValid])
  const quick = presets(gpus)
  const on = quick.find((x) => isPreset(p, x))?.id ?? ''
  const queue = queueText(p.partition, p.qos)
  return (
    <>
      <div className="px-5 pb-4">
        <Segments label="Quick sizes" value={on} options={quick.map((x) => [x.id, quickLabel(x)] as const)}
          onChange={(id) => onChange(quick.find((x) => x.id === id)!.apply(p))} />
      </div>
      <List>
        <NumberRow label="Cores" unit="cores" showUnit={false} value={p.cpus} max={limits?.cores}
          onChange={(n) => set({ cpus: n })} />
        <NumberRow label="Memory" unit="GB" value={p.mem_gb} max={limits?.memory_gb}
          onChange={(n) => set({ mem_gb: n })} />
        {gpus.length > 0 && <Row label="GPU" value={gpuSummary(p, gpus) || 'No GPU'} opens
          onPress={() => setOpen('gpu')} />}
        <DurationRow label="Time" minutes={minutes(p.time) ?? 240} max={limits?.longest}
          onChange={(m) => set({ time: slurmTime(Math.max(1, m)) })} />
        <Row label="Queue and priority" value={queue} opens onPress={() => setOpen('queue')} />
      </List>
      {open === 'gpu' && <GpuDialog gpus={gpus} value={p} onChange={onChange} onClose={() => setOpen('')} />}
      {open === 'queue' && <QueueDialog limits={limits} value={p} onChange={onChange} extra={extra}
        onClose={() => setOpen('')} />}
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
