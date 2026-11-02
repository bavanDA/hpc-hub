// A cluster's compute node in style E (compute_dialog.py): its size before a node is requested, with your saved
// choice filled in, or what connecting gets you. The size itself is e/NodeFields: quick sizes, then rows.
// Duration and GpuPicker are the older pieces other dialogs still use.
import { Check } from 'lucide-react'
import { useState } from 'react'

import { call } from '../../rpc'
import { summary, type Cluster, type Limits, type Profile } from '../../types/clusters'
import { NodeFields } from '../e/NodeFields'
import { EDialog, List, MainButton, Section, ToggleRow } from '../e/ui'
import { useToast } from '../toast'
import { ActionRow, NumberBox } from './fields'
import { chosen, gpuHints, gpuName, withGpu, type Gpu } from './gpus'
import { shortName } from './loginCopy'
import { putCluster } from './store'
import { human } from './time'

export function Duration({ total, onChange, limits }:
  { total: number; onChange: (m: number) => void; limits: Limits | null }) {
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60
  const set = (dd: number, hh: number, mm: number) => onChange(dd * 1440 + hh * 60 + mm)
  const sub = !limits?.known ? 'Max shown after you connect'
    : limits.longest ? `Up to ${human(limits.longest)}` : 'No time limit'
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

export const ASK = 'Ask before each request'
export const ASK_SUB = 'Shows this window when you connect.'

/** The phone's NodeSheet at desktop size. setup: whether to get a node when you connect, its size and Ask before
 *  each request, saved, nothing requested. request: ask Slurm for a node now, the saved size filled in. */
export function ComputeDialog({ cluster: c, mode, onClose }:
  { cluster: Cluster; mode: 'setup' | 'request'; onClose: () => void }) {
  const toast = useToast()
  const [p, setP] = useState<Profile>({ ...c.profile, account: c.profile.account ?? '', qos: c.profile.qos ?? '' })
  const [want, setWant] = useState(c.request_node_on_connect ?? true)
  const [ask, setAsk] = useState(c.ask_node ?? false)
  const [remember, setRemember] = useState(true)
  const [sending, setSending] = useState(false)
  const [ok, setOk] = useState(true)
  const sizing = mode === 'request' || want

  async function go() {
    const profile: Profile = { cpus: p.cpus, mem_gb: p.mem_gb, gpus: p.gpus ?? 0, gpu_type: p.gpu_type ?? '',
      time: p.time, partition: p.partition.trim(), account: (p.account ?? '').trim(), qos: (p.qos ?? '').trim() }
    setSending(true)
    try {
      if (mode === 'setup') {
        putCluster(await call<Cluster>('clusters.update', { cluster: c.id,
          changes: { profile, request_node_on_connect: want, ask_node: ask } }))
      } else {
        if (ask !== (c.ask_node ?? false)) {
          putCluster(await call<Cluster>('clusters.update', { cluster: c.id, changes: { ask_node: ask } }))
        }
        await call('clusters.request_node', { cluster: c.id, profile, remember })
        if (remember) putCluster({ ...c, profile: { ...c.profile, ...profile }, ask_node: ask })
      }
      onClose()
    } catch (e) {
      toast((e as Error).message)
      setSending(false)
    }
  }

  return (
    <EDialog title={mode === 'setup' ? `Compute node on ${shortName(c)}` : `Get a node on ${shortName(c)}`}
      onClose={onClose} actions={<MainButton disabled={sending || (sizing && !ok)} onClick={go}>
        {mode === 'setup' ? 'Save' : 'Get node'}</MainButton>}>
      {mode === 'setup' && <div className="pb-5"><List>
        <ToggleRow label="Get a node when I connect" sub="Your terminals and agents run there." checked={want}
          onChange={setWant} /></List></div>}
      {sizing && <div className="pt-1">
        <NodeFields cluster={c.id} value={p} onChange={setP} onValid={setOk} extra={false} /></div>}
      {sizing && <Section>
        {mode === 'request' && <ToggleRow label="Use this size next time" checked={remember}
          sub={remember ? undefined : `Next time: ${summary(c.profile)}`} onChange={setRemember} />}
        <ToggleRow label={ASK} sub={ASK_SUB} checked={ask} onChange={setAsk} />
      </Section>}
    </EDialog>
  )
}
