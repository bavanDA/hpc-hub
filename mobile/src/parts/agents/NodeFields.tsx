// The compute node an agent or VS Code asks for: one summary line, and the numbers when you open it.
// Same fields as the desktop's compute group: cores, memory, GPUs, time, and the queue folded under them.
import { ChevronDown, ChevronRight, Cpu } from 'lucide-react'
import { useState } from 'react'

import { human, minutes, slurmTime } from '@shared/components/clusters/time'
import type { Profile } from '@shared/types/clusters'
import { Field } from '../../ui'

export const profileText = (p: Profile) => [`${p.cpus} cores`, `${p.mem_gb} GB`, p.gpus ? `${p.gpus} GPU` : '',
  human(minutes(p.time) ?? 240), p.partition].filter(Boolean).join(' · ')

/** A row that says where it runs; tap it to see and change the node's size (only when a new node is asked for). */
export function NodeRow({ line, sub, profile, onChange }:
  { line: string; sub?: string; profile?: Profile; onChange?: (p: Profile) => void }) {
  const [open, setOpen] = useState(false)
  const editable = Boolean(profile && onChange)
  return (
    <div className="rounded-2xl bg-card shadow-[var(--shadow-card)]">
      <button disabled={!editable} onClick={() => setOpen(!open)}
        className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left active:bg-hover disabled:active:bg-transparent">
        <Cpu size={22} className="shrink-0 text-dim" />
        <span className="min-w-0 flex-1">
          <span className="block">{line}</span>
          <span className="block truncate text-sm text-dim">{profile && editable ? profileText(profile) : sub}</span>
        </span>
        {editable && (open ? <ChevronDown size={20} className="text-dim" /> : <ChevronRight size={20} className="text-dim" />)}
      </button>
      {open && profile && onChange && <div className="px-4 pb-3"><NodeFields value={profile} onChange={onChange} /></div>}
    </div>
  )
}

export function NodeFields({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const set = (change: Partial<Profile>) => onChange({ ...value, ...change })
  const [more, setMore] = useState(false)
  const total = minutes(value.time) ?? 240
  const num = (text: string, min: number) => Math.max(min, parseInt(text || '0', 10) || 0)
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Cores" type="number" inputMode="numeric" min={1} value={value.cpus}
          onChange={(e) => set({ cpus: num(e.target.value, 1) })} />
        <Field label="Memory (GB)" type="number" inputMode="numeric" min={1} value={value.mem_gb}
          onChange={(e) => set({ mem_gb: num(e.target.value, 1) })} />
        <Field label="GPUs" type="number" inputMode="numeric" min={0} value={value.gpus ?? 0}
          onChange={(e) => set({ gpus: num(e.target.value, 0) })} />
        <Field label="Hours" type="number" inputMode="decimal" min={0.25} step={0.5} value={+(total / 60).toFixed(2)}
          onChange={(e) => set({ time: slurmTime(Math.max(1, Math.round((parseFloat(e.target.value) || 0) * 60))) })} />
      </div>
      <button onClick={() => setMore(!more)} className="flex h-11 items-center gap-1 text-sm font-semibold text-dim">
        {more ? <ChevronDown size={16} /> : <ChevronRight size={16} />} Queue and billing</button>
      {more && <>
        <Field label="Queue (partition)" autoCapitalize="none" autoCorrect="off" value={value.partition}
          onChange={(e) => set({ partition: e.target.value })} />
        <Field label="Group to bill (account)" autoCapitalize="none" autoCorrect="off" value={value.account ?? ''}
          placeholder="Leave empty for your default group" onChange={(e) => set({ account: e.target.value })} />
        <Field label="Priority and billing (QoS)" autoCapitalize="none" autoCorrect="off" value={value.qos ?? ''}
          onChange={(e) => set({ qos: e.target.value })} />
      </>}
    </div>
  )
}
