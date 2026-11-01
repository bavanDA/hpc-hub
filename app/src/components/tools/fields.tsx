// Rows the tool dialogs share: a folder with a Browse button, a choice, a text box, and the compute node.
import { ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { Limits, Profile } from '../../types/clusters'
import { ActionRow, EntryRow, Group, NumberBox } from '../clusters/fields'
import { human, minutes, slurmTime } from '../clusters/time'
import { FolderPicker } from '../projects/FolderPicker'
import { IconButton } from '../ui'

export const selectClass = 'h-8 max-w-[260px] rounded-md bg-pill px-2 outline-none focus:ring-2 focus:ring-accent'

/** Like Adw.EntryRow with a Choose folder button. */
export function FolderRow({ cluster, label = 'Folder', value, onChange }:
  { cluster: { id: string; name: string }; label?: string; value: string; onChange: (v: string) => void }) {
  const [picking, setPicking] = useState(false)
  return (
    <div className="flex min-h-[56px] items-center gap-2 py-1.5 pr-2 pl-4 focus-within:bg-hover">
      <label className="min-w-0 flex-1">
        <div className="text-[12px] text-dim">{label}</div>
        <input value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} autoComplete="off"
          className="w-full bg-transparent text-[15px] outline-none" />
      </label>
      <IconButton icon={FolderOpen} label="Choose folder" onClick={() => setPicking(true)} />
      {picking && <FolderPicker cluster={{ ...cluster, connected: true }} start={value.trim() || '~'}
        onPick={onChange} onClose={() => setPicking(false)} />}
    </div>
  )
}

export function SelectRow({ label, sub, value, choices, onChange }:
  { label: string; sub?: string; value: string; choices: [string, string][]; onChange: (v: string) => void }) {
  return (
    <ActionRow label={label} sub={sub}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {choices.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </ActionRow>
  )
}

export function TextBox({ value, onChange, rows = 3, placeholder, autoFocus }:
  { value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; autoFocus?: boolean }) {
  return (
    <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder}
      autoFocus={autoFocus}
      className="block w-full resize-y rounded-xl bg-card px-3 py-2.5 shadow-[var(--shadow-card)] outline-none
        placeholder:text-dim focus:ring-2 focus:ring-accent" />
  )
}

export function Section({ title, description, children }:
  { title?: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-5">
      {title && <h3 className="mb-1 text-[15px] font-bold">{title}</h3>}
      {description && <p className="mb-2 text-[13px] text-dim">{description}</p>}
      {children}
    </div>
  )
}

/** Cores, memory, GPUs and time up front; partition, account and QOS folded away (compute_dialog.py). */
export function ComputeGroup({ cluster, value, onChange, disabled = false, description, title = 'Compute node' }:
  { cluster: string; value: Profile; onChange: (p: Profile) => void; disabled?: boolean; description?: string;
    title?: string }) {
  const [more, setMore] = useState(false)
  const [limits, setLimits] = useState<Limits | null>(null)
  const set = (change: Partial<Profile>) => onChange({ ...value, ...change })
  const { partition, qos = '' } = value
  useEffect(() => {  // the partition and QoS decide the longest time
    const t = setTimeout(() => {
      call<Limits>('clusters.partitions', { cluster, partition, qos }).then(setLimits).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [cluster, partition, qos])

  const total = minutes(value.time) ?? 240
  const top = limits?.longest ?? null
  const setTime = (m: number) => set({ time: slurmTime(Math.max(1, top ? Math.min(m, top) : m)) })
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60
  const sub = !limits?.known ? 'Max shown after you connect'
    : limits.longest ? `Longest allowed: ${human(limits.longest)} (${limits.why})` : 'No time limit here'
  const queue = [partition, value.account ?? '', qos].filter((x) => x.trim()).join(' · ') || "The cluster's defaults"
  const time = 'h-8 w-12 rounded-md bg-pill text-center tabular-nums outline-none focus:ring-2 focus:ring-accent'
  const unit = (label: string, short: string, v: number, max: number, to: (n: number) => number) => (
    <label key={short} className="flex items-center gap-1">
      <input aria-label={label} type="number" min={0} max={max} value={v} className={time}
        onChange={(e) => setTime(to(Math.min(max, Math.max(0, parseInt(e.target.value || '0', 10) || 0))))} />
      <span className="mr-1 text-dim">{short}</span>
    </label>
  )

  return (
    <div className={disabled ? 'pointer-events-none opacity-50' : ''} aria-disabled={disabled}>
      <Group title={title} description={description}>
        <ActionRow label="CPU cores"><NumberBox label="CPU cores" value={value.cpus} min={1} max={512}
          onChange={(cpus) => set({ cpus })} /></ActionRow>
        <ActionRow label="Memory (GB)"><NumberBox label="Memory (GB)" value={value.mem_gb} min={1} max={4096}
          onChange={(mem_gb) => set({ mem_gb })} /></ActionRow>
        <ActionRow label="GPUs"><NumberBox label="GPUs" value={value.gpus ?? 0} min={0} max={16}
          onChange={(gpus) => set({ gpus })} /></ActionRow>
        <ActionRow label="Time" sub={sub}>
          <div className="flex items-center">
            {unit('days', 'd', d, 99, (n) => n * 1440 + h * 60 + m)}
            {unit('hours', 'h', h, 23, (n) => d * 1440 + n * 60 + m)}
            {unit('minutes', 'min', m, 59, (n) => d * 1440 + h * 60 + n)}
          </div>
        </ActionRow>
        <button type="button" onClick={() => setMore(!more)}
          className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
          <div className="min-w-0 flex-1">
            <div>Partition, account and QOS</div>
            <div className="truncate text-[13px] text-dim">{queue}</div>
          </div>
          {more ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {more && <>
          <EntryRow label="Partition" value={partition} onChange={(v) => set({ partition: v })}
            list={limits?.partitions} placeholder={limits?.default_partition} />
          <EntryRow label="Account" value={value.account ?? ''} onChange={(v) => set({ account: v })} />
          <EntryRow label="QOS" value={qos} onChange={(v) => set({ qos: v })} list={limits?.qos}
            placeholder={limits?.default_qos} />
        </>}
      </Group>
    </div>
  )
}
