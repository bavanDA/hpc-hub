// A cluster's compute node on the phone, in style E (docs/design/style-e). Two ways in:
// - "setup": from ⋮ or Settings. Whether to get one when you connect, its size, and "Ask before each request".
//   Saved, nothing requested.
// - "request": ask Slurm for a node now (Get a node, or Ask every time after connecting), the saved size filled in.
// NodeFields is the size itself, shared with the cluster's Settings › Compute: quick sizes on top, then rows. Cores,
// memory and time are typed in place (any number up to the queue's biggest node and longest time); GPU and Queue
// open their own screens.
import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'

import { chosen, gpuName, gpuSummary, isPreset, presets, useGpus, withGpu, type Gpu } from '@shared/components/clusters/gpus'
import { human, minutes, slurmTime } from '@shared/components/clusters/time'
import { putCluster } from '@shared/components/clusters/store'
import { call } from '@shared/rpc'
import { gpuText, type Cluster, type Limits, type Profile } from '@shared/types/clusters'
import {
  DurationRow, Field, inRange, List, MainButton, NumberRow, PickerSheet, Row, Section, Segmented, Sheet, Switch,
  ToggleRow, useToast,
} from '../ui'

/** The cluster's name without the school: "Wulver (NJIT)" -> "Wulver". */
export const shortName = (c: Cluster) => c.name.split(' (')[0]

/** What Slurm allows on the queue the profile asks for (read at the last login). */
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

/** Whether Slurm would take this size: every number in range. */
function fits(p: Profile, limits: Limits | null, g: Gpu | null) {
  return inRange(p.cpus, 1, limits?.cores) && inRange(p.mem_gb, 1, limits?.memory_gb)
    && inRange(minutes(p.time) ?? 0, 1, limits?.longest) && (!g || inRange(p.gpus ?? 1, 1, g.max_per_job))
}

/** The GPU screen: none, each slice, each whole GPU; how many when a whole one can be more than one. */
function GpuSheet({ gpus, value: p, onChange, onClose }:
  { gpus: Gpu[]; value: Profile; onChange: (p: Profile) => void; onClose: () => void }) {
  const g = chosen(p, gpus)
  const ok = !g || inRange(p.gpus ?? 1, 1, g.max_per_job)
  const tick = (on: boolean) => on ? <Check size={20} aria-label="Chosen" className="shrink-0" /> : <span className="w-5" />
  return (
    <Sheet title="GPU" flush onClose={onClose}
      actions={<MainButton disabled={!ok} onClick={onClose}>Done</MainButton>}>
      <List>
        <Row label="No GPU" onPress={() => onChange(withGpu(p, null))}>{tick(!p.gpus)}</Row>
        {gpus.map((x) => (
          <Row key={x.type || 'any'} label={gpuName(x)} onPress={() => onChange(withGpu(p, x, p.gpus || 1))}>
            {tick(!!g && g.type === x.type)}</Row>
        ))}
      </List>
      {g && !g.slice && g.max_per_job > 1 && <Section>
        <NumberRow label="How many" unit={p.gpus === 1 ? 'GPU' : 'GPUs'} value={p.gpus ?? 1} max={g.max_per_job}
          onChange={(n) => onChange({ ...p, gpus: n })} />
      </Section>}
    </Sheet>
  )
}

/** Queue, billing, group and extra options: set once, then left alone. */
function QueueSheet({ limits, value: p, onChange, onClose }:
  { limits: Limits | null; value: Profile; onChange: (p: Profile) => void; onClose: () => void }) {
  const [pick, setPick] = useState<'' | 'queue' | 'billing'>('')
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  const def = (x?: string) => (x ? `${x} (default)` : 'Default')
  const queues = (limits?.partitions ?? []).map((q) => ({ value: q, label: q === limits?.default_partition ? def(q) : q }))
  const billing = (limits?.qos ?? []).map((q) => ({ value: q, label: q === limits?.default_qos ? def(q) : q }))
  const text = { autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const
  return (
    <Sheet title="Queue and billing" flush onClose={onClose}
      actions={<MainButton onClick={onClose}>Done</MainButton>}>
      <List>
        {queues.length ? <Row label="Queue" value={p.partition || def(limits?.default_partition)} opens
          onPress={() => setPick('queue')} /> : null}
        {billing.length ? <Row label="Billing" value={p.qos || def(limits?.default_qos)} opens
          onPress={() => setPick('billing')} /> : null}
      </List>
      <div className="px-4 pt-2">
        {!queues.length && <Field label="Queue" {...text} value={p.partition} placeholder="Default"
          onChange={(e) => set({ partition: e.target.value.trim() })} />}
        {!billing.length && <Field label="Billing" {...text} value={p.qos ?? ''} placeholder="Default"
          onChange={(e) => set({ qos: e.target.value.trim() })} />}
        <Field label="Group to bill" {...text} value={p.account ?? ''} placeholder="Your default group"
          onChange={(e) => set({ account: e.target.value.trim() })} />
        <Field label="Extra options" {...text} value={p.extra_args ?? ''} placeholder="--constraint=intel"
          onChange={(e) => set({ extra_args: e.target.value })} />
      </div>
      {pick === 'queue' && <PickerSheet title="Queue" options={[{ value: '', label: 'Default' }, ...queues]}
        value={p.partition} onPick={(v) => set({ partition: v })} onClose={() => setPick('')} />}
      {pick === 'billing' && <PickerSheet title="Billing" options={[{ value: '', label: 'Default' }, ...billing]}
        value={p.qos ?? ''} onPick={(v) => set({ qos: v })} onClose={() => setPick('')} />}
    </Sheet>
  )
}

/** The node's size: quick sizes, then Cores, Memory, GPU, Time, and the queue. Rows run edge to edge.
 *  onValid hears whether every number is allowed, so the screen can turn its button off. */
export function NodeFields({ cluster, value: p, onChange, onValid }:
  { cluster: Cluster; value: Profile; onChange: (p: Profile) => void; onValid?: (ok: boolean) => void }) {
  const [open, setOpen] = useState<'' | 'gpu' | 'queue'>('')
  const { gpus } = useGpus(cluster.id)
  const limits = useLimits(cluster.id, p)
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  const g = chosen(p, gpus)
  const ok = fits(p, limits, g)
  useEffect(() => { onValid?.(ok) }, [ok, onValid])

  const quick = presets(gpus)
  const on = quick.find((x) => isPreset(p, x))?.id ?? ''
  const queue = [p.partition, p.qos].filter((x) => x?.trim()).join(', ') || 'Default'

  return (
    <>
      <div className="px-4 pb-5">
        <Segmented label="Quick sizes" value={on} options={quick.map((x) => [x.id, x.label] as const)}
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
        <Row label="Queue and billing" value={queue} opens onPress={() => setOpen('queue')} />
      </List>
      {open === 'gpu' && <GpuSheet gpus={gpus} value={p} onChange={onChange} onClose={() => setOpen('')} />}
      {open === 'queue' && <QueueSheet limits={limits} value={p} onChange={onChange} onClose={() => setOpen('')} />}
    </>
  )
}

export const ASK = 'Ask before each request'
export const ASK_SUB = 'Shows this screen when you connect.'

/** "Ask before each request" inside padded content (Settings › Compute). */
export function AskFirst({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return <Switch label={ASK} hint={ASK_SUB} checked={checked} onChange={onChange} />
}

/** The size in a few words: "2 cores · 8 GB · A100, 10 GB slice · 4 h". */
export function nodeSize(c: Cluster) {
  const p = c.profile
  const t = minutes(p.time)
  return [`${p.cpus} cores`, `${p.mem_gb} GB`, gpuText(p), t ? human(t) : p.time].filter(Boolean).join(' · ')
}

/** What connecting gets you, for Settings. */
export function nodeLine(c: Cluster) {
  return (c.request_node_on_connect ?? true) ? `Gets a node: ${nodeSize(c)}` : 'No compute node when you connect'
}

export function NodeSheet({ cluster: c, mode, onClose }:
  { cluster: Cluster; mode: 'setup' | 'request'; onClose: () => void }) {
  const toast = useToast()
  const [p, setP] = useState<Profile>(c.profile)
  const [want, setWant] = useState(c.request_node_on_connect ?? true)
  const [ask, setAsk] = useState(c.ask_node ?? false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)
  const [ok, setOk] = useState(true)
  const sizing = mode === 'request' || want

  async function done() {
    setBusy(true)
    try {
      if (mode === 'setup') {
        putCluster(await call<Cluster>('clusters.update', { cluster: c.id,
          changes: { profile: p, request_node_on_connect: want, ask_node: ask } }))
      } else {
        if (ask !== (c.ask_node ?? false)) {
          putCluster(await call<Cluster>('clusters.update', { cluster: c.id, changes: { ask_node: ask } }))
        }
        await call('clusters.request_node', { cluster: c.id, profile: p, remember })
        if (remember) putCluster({ ...c, profile: p, ask_node: ask })
      }
      onClose()
    } catch (e) {
      toast((e as Error).message)
      setBusy(false)
    }
  }

  return (
    <Sheet flush title={mode === 'setup' ? `Compute node on ${shortName(c)}` : `Get a node on ${shortName(c)}`}
      onClose={onClose} actions={<MainButton disabled={busy || (sizing && !ok)} onClick={done}>
        {mode === 'setup' ? 'Save' : 'Get node'}</MainButton>}>
      {mode === 'setup' && <List className="mb-5">
        <ToggleRow label="Get a node when I connect" sub="Your terminals and agents run there." checked={want}
          onChange={setWant} /></List>}
      {sizing && <NodeFields cluster={c} value={p} onChange={setP} onValid={setOk} />}
      {sizing && <Section>
        {mode === 'request' && <ToggleRow label="Use this size next time" checked={remember} onChange={setRemember} />}
        <ToggleRow label={ASK} sub={ASK_SUB} checked={ask} onChange={setAsk} />
      </Section>}
    </Sheet>
  )
}
