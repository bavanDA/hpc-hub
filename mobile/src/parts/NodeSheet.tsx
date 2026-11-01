// A cluster's compute node on the phone. Two ways in:
// - "setup": the card's quiet "Gets a node: …" line. Whether to get one when you connect, its size, and, small at
//   the bottom, "Ask before each request". Saved, nothing requested.
// - "request": ask Slurm for a node now (Get one, or Ask every time after connecting), with the saved size filled in.
// NodeFields is the size itself, shared with the cluster's Settings › Compute.
import { useEffect, useState } from 'react'

import { human, minutes, slurmTime } from '@shared/components/clusters/time'
import { putCluster } from '@shared/components/clusters/store'
import { call } from '@shared/rpc'
import type { Cluster, Limits, Profile } from '@shared/types/clusters'
import { Button, Field, ListRow, PickerSheet, Sheet, Switch, useToast } from '../ui'

const num = (text: string, min: number) => Math.max(min, parseInt(text || '0', 10) || 0)

/** The node's size and queue. The time is days, hours and minutes; the queue comes from the cluster's limits. */
export function NodeFields({ cluster, value: p, onChange }:
  { cluster: Cluster; value: Profile; onChange: (p: Profile) => void }) {
  const [limits, setLimits] = useState<Limits | null>(null)
  const [pick, setPick] = useState<'' | 'queue' | 'priority'>('')
  const set = (change: Partial<Profile>) => onChange({ ...p, ...change })
  useEffect(() => {
    const t = setTimeout(() => {
      call<Limits>('clusters.partitions', { cluster: cluster.id, partition: p.partition, qos: p.qos ?? '' })
        .then(setLimits).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [cluster.id, p.partition, p.qos])

  const total = minutes(p.time) ?? 240
  const d = Math.floor(total / 1440), h = Math.floor((total % 1440) / 60), m = total % 60
  const setTime = (dd: number, hh: number, mm: number) => set({ time: slurmTime(dd * 1440 + hh * 60 + mm) })
  const longest = limits?.known ? limits.longest : null
  const timeHint = !limits?.known ? 'The longest allowed shows after you connect.'
    : longest ? `Up to ${human(longest)} on this queue.` : 'No time limit on this queue.'
  const queues = (limits?.partitions ?? []).map((q) => ({ value: q, label: q,
    hint: q === limits?.default_partition ? 'The cluster’s default' : undefined }))
  const priorities = (limits?.qos ?? []).map((q) => ({ value: q, label: q,
    hint: q === limits?.default_qos ? 'The cluster’s default' : undefined }))

  return (
    <>
      <div className="grid grid-cols-3 gap-x-3">
        <Field label="Cores" inputMode="numeric" value={p.cpus} onChange={(e) => set({ cpus: num(e.target.value, 1) })} />
        <Field label="Memory (GB)" inputMode="numeric" value={p.mem_gb}
          onChange={(e) => set({ mem_gb: num(e.target.value, 1) })} />
        <Field label="GPUs" inputMode="numeric" value={p.gpus ?? 0} onChange={(e) => set({ gpus: num(e.target.value, 0) })} />
      </div>
      <div className="grid grid-cols-3 gap-x-3">
        <Field label="Days" inputMode="numeric" value={d} onChange={(e) => setTime(num(e.target.value, 0), h, m)} />
        <Field label="Hours" inputMode="numeric" value={h}
          onChange={(e) => setTime(d, Math.min(23, num(e.target.value, 0)), m)} />
        <Field label="Minutes" inputMode="numeric" value={m}
          onChange={(e) => setTime(d, h, Math.min(59, num(e.target.value, 0)))} />
      </div>
      <p className="-mt-1 mb-2 text-sm text-dim">{timeHint}</p>
      <p className="mt-3 text-sm font-bold text-dim">Queue and billing (optional)</p>
      <ListRow title="Queue" subtitle={p.partition || limits?.default_partition || 'The cluster’s default'}
        onClick={queues.length ? () => setPick('queue') : undefined} />
      {!queues.length && <Field label="Queue name" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={p.partition} onChange={(e) => set({ partition: e.target.value.trim() })} />}
      <Field label="Group to bill" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={p.account ?? ''}
        placeholder="Leave empty for your default group" onChange={(e) => set({ account: e.target.value.trim() })} />
      <ListRow title="Priority and billing" subtitle={p.qos || limits?.default_qos || 'The cluster’s default'}
        onClick={priorities.length ? () => setPick('priority') : undefined} />
      <Field label="Extra options for the request" autoCapitalize="none" autoCorrect="off" spellCheck={false}
        value={p.extra_args ?? ''} placeholder="e.g. --constraint=intel" onChange={(e) => set({ extra_args: e.target.value })} />
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
    <label className="mt-4 flex min-h-11 items-center gap-3 border-t border-line pt-3 text-sm text-dim">
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
  const size = [`${p.cpus} cores`, `${p.mem_gb} GB`, t ? human(t) : p.time, p.gpus ? `${p.gpus} GPU` : '']
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
    <Sheet title={mode === 'setup' ? 'Compute node' : `Get a node on ${c.name}`} onClose={onClose} actions={<>
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
