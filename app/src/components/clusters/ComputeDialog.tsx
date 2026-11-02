// Which resources to ask for before a node is requested, with your saved choice filled in (compute_dialog.py).
// Grouped like a form people fill in once: a summary on top, quick sizes, then size, GPU, time, and the queue folded.
// The GPU list is the cluster's own (clusters.gpus): slices of one GPU first, then whole GPUs with a count.
import { Check, ChevronDown, ChevronRight, Cpu } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import { cores, summary, type Cluster, type Limits, type Profile } from '../../types/clusters'
import { useToast } from '../toast'
import { Term } from '../Term'
import { Button, Dialog } from '../ui'
import { ActionRow, EntryRow, Group, NumberBox, SpinRow, SwitchRow } from './fields'
import { chosen, gpuHints, gpuName, gpuSummary, isPreset, presets, useGpus, withGpu, type Gpu } from './gpus'
import { putCluster } from './store'
import { human, minutes, slurmTime } from './time'

export function Duration({ total, onChange, limits }:
  { total: number; onChange: (m: number) => void; limits: Limits | null }) {
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60
  const set = (dd: number, hh: number, mm: number) => onChange(dd * 1440 + hh * 60 + mm)
  const sub = !limits?.known ? 'Max shown after you connect'
    : limits.longest ? `Up to ${human(limits.longest)} on this queue` : 'No time limit on this queue'
  const units: [string, string, number, number, (v: number) => void][] = [
    ['days', 'd', d, 99, (v) => set(v, h, m)], ['hours', 'h', h, 23, (v) => set(d, v, m)],
    ['minutes', 'min', m, 59, (v) => set(d, h, v)]]
  return (
    <ActionRow label="Time" sub={sub}>
      <div className="flex items-center gap-1.5">
        {units.map(([label, unit, value, max, onChange]) => (
          <label key={unit} className="flex items-center gap-1.5">
            <input aria-label={label} type="number" min={0} max={max} value={value}
              onChange={(e) => onChange(Math.min(max, Math.max(0, parseInt(e.target.value || '0', 10) || 0)))}
              className="h-8 w-14 rounded-md bg-pill pl-2 text-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-inset
                focus-visible:ring-focus" />
            <span className="mr-1.5 text-dim">{unit}</span>
          </label>
        ))}
      </div>
    </ActionRow>
  )
}

/** One choice in the GPU list: its name, memory, and what it is. */
function GpuChoice({ title, sub, on, onPick }: { title: string; sub?: string; on: boolean; onPick: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick}
      className={`flex min-h-[64px] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors
        ${on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'}`}>
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title}</div>
        {sub && <div className="text-sm text-dim">{sub}</div>}
      </div>
      {on && <Check size={16} className="shrink-0 text-accent-text" />}
    </button>
  )
}

/** None, then each GPU the cluster has; a whole GPU gets a count. Shared wording with the phone's node screen. */
export function GpuPicker({ gpus, value: p, onChange }:
  { gpus: Gpu[]; known?: boolean; value: Profile; onChange: (p: Profile) => void }) {
  const g = chosen(p, gpus)
  const hints = gpuHints(gpus)
  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div role="radiogroup" aria-label="GPU" className="grid grid-cols-2 gap-2">
        <GpuChoice title="No GPU" on={!p.gpus} onPick={() => onChange(withGpu(p, null))} />
        {gpus.map((x, i) => (
          <GpuChoice key={x.type || 'any'} title={gpuName(x)} sub={hints[i]}
            on={!!g && g.type === x.type} onPick={() => onChange(withGpu(p, x, p.gpus || 1))} />
        ))}
      </div>
      {g && !g.slice && g.max_per_job > 1 && (
        <div className="flex items-center justify-between pt-1">
          <span>How many {g.label} GPUs</span>
          <NumberBox label="GPUs" value={p.gpus ?? 1} min={1} max={g.max_per_job}
            onChange={(n) => onChange(withGpu(p, g, n))} />
        </div>
      )}
    </div>
  )
}

/** saveOnly: change the saved size without asking for a node now (the card's Change, before you connect). */
export function ComputeDialog({ cluster: c, onClose, saveOnly = false }:
  { cluster: Cluster; onClose: () => void; saveOnly?: boolean }) {
  const toast = useToast()
  const [p, setP] = useState<Profile>({ ...c.profile, account: c.profile.account ?? '', qos: c.profile.qos ?? '' })
  const [total, setTotal] = useState(minutes(c.profile.time) ?? 240)
  const [more, setMore] = useState(false)
  const [remember, setRemember] = useState(true)
  const [limits, setLimits] = useState<Limits | null>(null)
  const [sending, setSending] = useState(false)
  const { gpus } = useGpus(c.id)
  const set = (change: Partial<Profile>) => setP((x) => ({ ...x, ...change }))

  // the partition and QoS decide the longest time
  useEffect(() => {
    const t = setTimeout(() => {
      call<Limits>('clusters.partitions', { cluster: c.id, partition: p.partition, qos: p.qos ?? '' })
        .then(setLimits).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [c.id, p.partition, p.qos])
  const top = limits?.longest ?? null
  const time = Math.max(1, top ? Math.min(total, top) : total)

  async function go() {
    const profile: Profile = { cpus: p.cpus, mem_gb: p.mem_gb, gpus: p.gpus ?? 0, gpu_type: p.gpu_type ?? '',
      time: slurmTime(time), partition: p.partition.trim(), account: (p.account ?? '').trim(), qos: (p.qos ?? '').trim() }
    setSending(true)
    try {
      if (saveOnly) {
        putCluster(await call<Cluster>('clusters.update', { cluster: c.id, changes: { profile } }))
        onClose()
        return
      }
      await call('clusters.request_node', { cluster: c.id, profile, remember })
      if (remember) putCluster({ ...c, profile: { ...c.profile, ...profile } })
      onClose()
    } catch (e) {
      toast((e as Error).message)
      setSending(false)
    }
  }

  const gpu = gpuSummary(p, gpus)
  const line = [cores(p.cpus), `${p.mem_gb} GB`, gpu, human(time)].filter(Boolean).join(' · ')
  const queue = [p.partition, p.account, p.qos].filter((x) => x?.trim()).join(' · ') || "The cluster's defaults"
  return (
    <Dialog title={saveOnly ? 'Compute node size' : `Compute node on ${c.name}`} onClose={onClose} width={640}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={sending} onClick={go}>{saveOnly ? 'Save' : 'Get node'}</Button>
      </>}>
      <div className="mb-4 flex items-center gap-3 rounded-lg bg-inset px-4 py-3">
        <Cpu size={20} className="shrink-0 text-dim" />
        <div className="min-w-0">
          <div className="font-semibold tabular-nums">{line}</div>
          {saveOnly && <div className="text-sm text-dim">Used each time you connect.</div>}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {presets(gpus).map((x) => {
          const on = isPreset(p, x)
          return (
            <button key={x.id} type="button" aria-pressed={on} onClick={() => setP((cur) => x.apply(cur))}
              className={`rounded-lg border px-3 py-1.5 text-left ${on ? 'border-accent bg-accent-soft'
                : 'border-line hover:bg-hover'}`}>
              <div className="text-sm font-semibold">{x.label}</div>
              <div className="text-xs text-dim">{x.hint}</div>
            </button>
          )
        })}
      </div>
      <Group title="Size">
        <SpinRow label="CPU cores" value={p.cpus} onChange={(v) => set({ cpus: v })} min={1} max={512} />
        <SpinRow label="Memory (GB)" value={p.mem_gb} onChange={(v) => set({ mem_gb: v })} min={1} max={4096} />
      </Group>
      <Group title="GPU">
        <GpuPicker gpus={gpus} value={p} onChange={setP} />
      </Group>
      <Group>
        <Duration total={time} onChange={setTotal} limits={limits} />
      </Group>
      <Group>
        <button type="button" onClick={() => setMore(!more)}
          className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
          <div className="min-w-0 flex-1">
            <div>Queue and billing <span className="text-dim">(optional)</span></div>
            <div className="truncate text-sm text-dim">{queue}</div>
          </div>
          {more ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {more && <>
          <EntryRow label={<Term name="queue">Queue</Term>} value={p.partition} onChange={(v) => set({ partition: v })}
            list={limits?.partitions} placeholder={limits?.default_partition || "The cluster's default"} />
          <EntryRow label={<Term name="group">Group to bill</Term>} value={p.account ?? ''}
            onChange={(v) => set({ account: v })} placeholder="Leave empty for your default group" />
          <EntryRow label={<Term name="priority">Priority and billing</Term>} value={p.qos ?? ''}
            onChange={(v) => set({ qos: v })} list={limits?.qos}
            placeholder={limits?.default_qos || "The cluster's default"} />
        </>}
      </Group>
      {!saveOnly && <Group>
        <SwitchRow label="Use these next time" sub={remember ? undefined : `Next time: ${summary(c.profile)}`}
          checked={remember} onChange={setRemember} />
      </Group>}
    </Dialog>
  )
}
