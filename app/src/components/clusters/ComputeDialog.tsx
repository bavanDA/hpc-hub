// Which resources to ask for before a node is requested, with your saved choice filled in (compute_dialog.py).
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import { summary, type Cluster, type Limits, type Profile } from '../../types/clusters'
import { useToast } from '../toast'
import { Term } from '../Term'
import { Button, Dialog } from '../ui'
import { ActionRow, EntryRow, Group, SpinRow, SwitchRow } from './fields'
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

/** saveOnly: change the saved size without asking for a node now (the card's Change, before you connect). */
export function ComputeDialog({ cluster: c, onClose, saveOnly = false }:
  { cluster: Cluster; onClose: () => void; saveOnly?: boolean }) {
  const toast = useToast()
  const p = c.profile
  const [cpus, setCpus] = useState(p.cpus)
  const [mem, setMem] = useState(p.mem_gb)
  const [gpus, setGpus] = useState(p.gpus ?? 0)
  const [total, setTotal] = useState(minutes(p.time) ?? 240)
  const [partition, setPartition] = useState(p.partition)
  const [account, setAccount] = useState(p.account ?? '')
  const [qos, setQos] = useState(p.qos ?? '')
  const [more, setMore] = useState(false)
  const [remember, setRemember] = useState(true)
  const [limits, setLimits] = useState<Limits | null>(null)
  const [sending, setSending] = useState(false)

  // the partition and QoS decide the longest time
  useEffect(() => {
    const t = setTimeout(() => {
      call<Limits>('clusters.partitions', { cluster: c.id, partition, qos }).then(setLimits).catch(() => {})
    }, 250)
    return () => clearTimeout(t)
  }, [c.id, partition, qos])
  const top = limits?.longest ?? null
  const time = Math.max(1, top ? Math.min(total, top) : total)

  async function go() {
    const profile: Profile = { cpus, mem_gb: mem, gpus, time: slurmTime(time), partition: partition.trim(),
      account: account.trim(), qos: qos.trim() }
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

  const queue = [partition, account, qos].filter((x) => x.trim()).join(' · ') || "The cluster's defaults"
  return (
    <Dialog title={saveOnly ? 'Compute node size' : `Compute node on ${c.name}`} onClose={onClose} width={600}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={sending} onClick={go}>{saveOnly ? 'Save' : 'Get node'}</Button>
      </>}>
      {saveOnly && <p className="mb-4 text-dim">HPC Hub asks for this size when you connect.</p>}
      <Group title="Compute node">
        <SpinRow label="CPU cores" value={cpus} onChange={setCpus} min={1} max={512} />
        <SpinRow label="Memory (GB)" value={mem} onChange={setMem} min={1} max={4096} />
        <SpinRow label="GPUs" value={gpus} onChange={setGpus} min={0} max={16} />
        <Duration total={time} onChange={setTotal} limits={limits} />
        <button type="button" onClick={() => setMore(!more)}
          className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left hover:bg-hover">
          <div className="min-w-0 flex-1">
            <div>Queue and billing <span className="text-dim">(optional)</span></div>
            <div className="truncate text-sm text-dim">{queue}</div>
          </div>
          {more ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        {more && <>
          <EntryRow label={<Term name="queue">Queue</Term>} value={partition} onChange={setPartition}
            list={limits?.partitions} placeholder={limits?.default_partition || "The cluster's default"} />
          <EntryRow label={<Term name="group">Group to bill</Term>} value={account} onChange={setAccount}
            placeholder="Leave empty for your default group" />
          <EntryRow label={<Term name="priority">Priority and billing</Term>} value={qos} onChange={setQos}
            list={limits?.qos} placeholder={limits?.default_qos || "The cluster's default"} />
        </>}
      </Group>
      {!saveOnly && <Group>
        <SwitchRow label="Use these next time" sub={remember ? undefined : `Next time: ${summary(c.profile)}`}
          checked={remember} onChange={setRemember} />
      </Group>}
    </Dialog>
  )
}
