// A cluster's compute node on the phone. Two ways in:
// - "setup": the card's quiet "Gets a node: …" line. Whether to get one when you connect, its size, and, small at
//   the bottom, "Ask before each request". Saved, nothing requested.
// - "request": ask Slurm for a node now (Get one, or Ask every time after connecting), with the saved size filled in.
// NodeFields is the size itself, shared with the cluster's Settings › Compute: a summary on top, quick sizes, big
// steppers for thumbs, the cluster's own GPUs (slices of one GPU first), time shortcuts, and the queue folded away.
import { Check, ChevronDown, ChevronRight, Cpu, Minus, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  chosen, gpuHint, gpuName, gpuSummary, isPreset, presets, useGpus, withGpu, type Gpu,
} from '@shared/components/clusters/gpus'
import { human, minutes, slurmTime } from '@shared/components/clusters/time'
import { putCluster } from '@shared/components/clusters/store'
import { call } from '@shared/rpc'
import { gpuText, type Cluster, type Limits, type Profile } from '@shared/types/clusters'
import { Button, Field, ListRow, PickerSheet, Sheet, Switch, useToast } from '../ui'

const TIMES: [string, number][] = [['1 h', 60], ['4 h', 240], ['8 h', 480], ['1 day', 1440], ['2 days', 2880]]

/** A number with big minus and plus buttons on either side, for thumbs. */
function Stepper({ label, value, unit = '', step = 1, min, max, onChange }: {
  label: string; value: number; unit?: string; step?: number; min: number; max: number; onChange: (v: number) => void
}) {
  // steps land on round numbers: 6 GB goes to 8, then 12
  const go = (dir: 1 | -1) => {
    const next = dir > 0 ? Math.floor(value / step) * step + step : Math.ceil(value / step) * step - step
    onChange(Math.min(max, Math.max(min, next)))
  }
  return (
    <div className="flex min-h-14 items-center gap-3">
      <span className="min-w-0 flex-1 font-semibold">{label}</span>
      <button aria-label={`Less ${label}`} disabled={value <= min} onClick={() => go(-1)}
        className="grid size-12 place-items-center rounded-full bg-pill active:bg-selected disabled:opacity-40">
        <Minus size={20} /></button>
      <span className="w-20 text-center text-lg font-semibold tabular-nums">{value}{unit}</span>
      <button aria-label={`More ${label}`} disabled={value >= max} onClick={() => go(1)}
        className="grid size-12 place-items-center rounded-full bg-pill active:bg-selected disabled:opacity-40">
        <Plus size={20} /></button>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-dim">{title}</h3>
      {children}
    </section>
  )
}

/** One GPU choice: a full-width row you tap, with what it is under its name. */
function GpuRow({ title, sub, on, onPick }: { title: string; sub: string; on: boolean; onPick: () => void }) {
  return (
    <button role="radio" aria-checked={on} onClick={onPick}
      className={`flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-2 text-left
        ${on ? 'border-accent bg-accent/10' : 'border-transparent bg-pill active:bg-selected'}`}>
      <span className="min-w-0 flex-1"><span className="block font-semibold">{title}</span>
        <span className="block text-sm text-dim">{sub}</span></span>
      <span className={`grid size-6 shrink-0 place-items-center rounded-full border-2
        ${on ? 'border-accent bg-accent text-white' : 'border-line'}`}>{on && <Check size={14} />}</span>
    </button>
  )
}

function GpuList({ gpus, known, value: p, onChange }:
  { gpus: Gpu[]; known: boolean; value: Profile; onChange: (p: Profile) => void }) {
  const g = chosen(p, gpus)
  return (
    <div role="radiogroup" aria-label="GPU" className="flex flex-col gap-2">
      <GpuRow title="No GPU" sub="CPU only" on={!p.gpus} onPick={() => onChange(withGpu(p, null))} />
      {gpus.map((x) => (
        <GpuRow key={x.type || 'any'} title={gpuName(x)} sub={gpuHint(x)} on={!!g && g.type === x.type}
          onPick={() => onChange(withGpu(p, x, p.gpus || 1))} />
      ))}
      {g && !g.slice && g.max_per_job > 1 && <Stepper label="How many" value={p.gpus ?? 1} min={1}
        max={g.max_per_job} onChange={(n) => onChange(withGpu(p, g, n))} />}
      {g && g.partitions.length > 0 && <p className="text-sm text-dim">Runs on the {g.partitions.join(' or ')} queue.</p>}
      {!known && gpus.length > 0 && <p className="text-sm text-dim">From the cluster's docs. The real list shows after you
        connect.</p>}
    </div>
  )
}

/** The node's size and queue. */
export function NodeFields({ cluster, value: p, onChange }:
  { cluster: Cluster; value: Profile; onChange: (p: Profile) => void }) {
  const [limits, setLimits] = useState<Limits | null>(null)
  const [pick, setPick] = useState<'' | 'queue' | 'priority'>('')
  const [more, setMore] = useState(false)
  const [custom, setCustom] = useState(false)
  const { gpus, known } = useGpus(cluster.id)
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  useEffect(() => {
    const t = setTimeout(() => {
      call<Limits>('clusters.partitions', { cluster: cluster.id, partition: p.partition, qos: p.qos ?? '' })
        .then(setLimits).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [cluster.id, p.partition, p.qos])

  const total = minutes(p.time) ?? 240
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60)
  const setTime = (m: number) => set({ time: slurmTime(Math.max(1, m)) })
  const longest = limits?.known ? limits.longest : null
  const timeHint = !limits?.known ? 'The longest allowed shows after you connect.'
    : longest ? `Up to ${human(longest)} on this queue.` : 'No time limit on this queue.'
  const queues = (limits?.partitions ?? []).map((q) => ({ value: q, label: q,
    hint: q === limits?.default_partition ? 'The cluster’s default' : undefined }))
  const priorities = (limits?.qos ?? []).map((q) => ({ value: q, label: q,
    hint: q === limits?.default_qos ? 'The cluster’s default' : undefined }))
  const line = [`${p.cpus} cores`, `${p.mem_gb} GB`, gpuSummary(p, gpus), human(total)].filter(Boolean).join(' · ')
  const queue = [p.partition, p.account, p.qos].filter((x) => x?.trim()).join(' · ') || 'The cluster’s defaults'
  const quick = TIMES.some(([, m]) => m === total)

  return (
    <>
      <div className="mb-4 flex items-center gap-3 rounded-2xl bg-accent/10 px-4 py-3">
        <Cpu size={22} className="shrink-0 text-accent-text" />
        <div className="min-w-0">
          <p className="font-semibold tabular-nums">{line}</p>
          <p className="text-sm text-dim">{p.partition ? `On the ${p.partition} queue` : 'On the cluster’s default queue'}</p>
        </div>
      </div>
      <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {presets(gpus).map((x) => {
          const on = isPreset(p, x)
          return (
            <button key={x.id} aria-pressed={on} onClick={() => onChange(x.apply(p))}
              className={`flex min-h-14 shrink-0 flex-col justify-center rounded-xl border-2 px-4 text-left
                ${on ? 'border-accent bg-accent/10' : 'border-transparent bg-pill active:bg-selected'}`}>
              <span className="font-semibold">{x.label}</span><span className="text-xs text-dim">{x.hint}</span></button>
          )
        })}
      </div>

      <Section title="Size">
        <Stepper label="Cores" value={p.cpus} min={1} max={256} onChange={(v) => set({ cpus: v })} />
        <Stepper label="Memory" value={p.mem_gb} unit=" GB" step={4} min={1} max={2048}
          onChange={(v) => set({ mem_gb: v })} />
      </Section>

      <Section title="GPU"><GpuList gpus={gpus} known={known} value={p} onChange={onChange} /></Section>

      <Section title="Time">
        <div className="flex flex-wrap gap-2">
          {TIMES.map(([label, m]) => (
            <button key={label} onClick={() => { setCustom(false); setTime(m) }}
              disabled={!!longest && m > longest}
              className={`h-12 rounded-full px-4 font-semibold disabled:opacity-40
                ${total === m && !custom ? 'bg-accent text-white' : 'bg-pill active:bg-selected'}`}>{label}</button>
          ))}
          <button onClick={() => setCustom(true)} className={`h-12 rounded-full px-4 font-semibold
            ${custom || !quick ? 'bg-accent text-white' : 'bg-pill active:bg-selected'}`}>Other</button>
        </div>
        {(custom || !quick) && <>
          <Stepper label="Days" value={d} min={0} max={30} onChange={(v) => setTime(v * 1440 + h * 60)} />
          <Stepper label="Hours" value={h} min={0} max={23} onChange={(v) => setTime(d * 1440 + v * 60)} />
        </>}
        <p className="mt-2 text-sm text-dim">{timeHint}</p>
      </Section>

      <button onClick={() => setMore(!more)} className="flex min-h-14 w-full items-center gap-3 border-t border-line
        text-left">
        <span className="min-w-0 flex-1"><span className="block font-semibold">Queue and billing</span>
          <span className="block truncate text-sm text-dim">{queue}</span></span>
        {more ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
      </button>
      {more && <>
        <ListRow title="Queue" subtitle={p.partition || limits?.default_partition || 'The cluster’s default'}
          onClick={queues.length ? () => setPick('queue') : undefined} />
        {!queues.length && <Field label="Queue name" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={p.partition} onChange={(e) => set({ partition: e.target.value.trim() })} />}
        <Field label="Group to bill" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={p.account ?? ''}
          placeholder="Leave empty for your default group" onChange={(e) => set({ account: e.target.value.trim() })} />
        <ListRow title="Priority and billing" subtitle={p.qos || limits?.default_qos || 'The cluster’s default'}
          onClick={priorities.length ? () => setPick('priority') : undefined} />
        <Field label="Extra options for the request" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          value={p.extra_args ?? ''} placeholder="e.g. --constraint=intel"
          onChange={(e) => set({ extra_args: e.target.value })} />
      </>}
      {pick === 'queue' && <PickerSheet title="Queue" options={[{ value: '', label: 'The cluster’s default' }, ...queues]}
        value={p.partition} onPick={(v) => set({ partition: v })} onClose={() => setPick('')} />}
      {pick === 'priority' && <PickerSheet title="Priority and billing"
        options={[{ value: '', label: 'The cluster’s default' }, ...priorities]} value={p.qos ?? ''}
        onPick={(v) => set({ qos: v })} onClose={() => setPick('')} />}
    </>
  )
}

/** A small checkbox at the bottom of the node screens, set once and then left alone. */
export function AskFirst({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="mt-4 flex min-h-12 items-center gap-3 border-t border-line pt-3 text-sm text-dim">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}
        className="size-5 shrink-0 accent-[var(--color-accent)]" />
      <span>Ask before each request <span className="block">Shows this screen once you're connected, so you can
        change the size first.</span></span>
    </label>
  )
}

/** The card's line: what connecting gets you. */
export function nodeLine(c: Cluster) {
  if (!(c.request_node_on_connect ?? true)) return 'No compute node when you connect'
  const p = c.profile
  const t = minutes(p.time)
  const size = [`${p.cpus} cores`, `${p.mem_gb} GB`, gpuText(p), t ? human(t) : p.time]
  return `Gets a node: ${size.filter(Boolean).join(' · ')}`
}

export function NodeSheet({ cluster: c, mode, onClose }:
  { cluster: Cluster; mode: 'setup' | 'request'; onClose: () => void }) {
  const toast = useToast()
  const [p, setP] = useState<Profile>(c.profile)
  const [want, setWant] = useState(c.request_node_on_connect ?? true)
  const [ask, setAsk] = useState(c.ask_node ?? false)
  const [remember, setRemember] = useState(true)
  const [busy, setBusy] = useState(false)

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
    <Sheet title={mode === 'setup' ? `Compute node on ${c.name}` : `Get a node on ${c.name}`} onClose={onClose} actions={<>
      <Button className="flex-1" onClick={onClose}>Cancel</Button>
      <Button kind="primary" className="flex-1" disabled={busy} onClick={done}>
        {mode === 'setup' ? 'Save' : 'Get node'}</Button></>}>
      {mode === 'setup' && <Switch label="Get a compute node when I connect"
        hint="Your terminals and agents run there, not on the shared login node." checked={want} onChange={setWant} />}
      {(mode === 'request' || want) && <NodeFields cluster={c} value={p} onChange={setP} />}
      {mode === 'request' && <Switch label="Use this size next time" checked={remember} onChange={setRemember} />}
      {(mode === 'request' || want) && <AskFirst checked={ask} onChange={setAsk} />}
    </Sheet>
  )
}
