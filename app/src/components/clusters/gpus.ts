// The GPUs a cluster offers (clusters.gpus, read from Slurm at login), shared by the desktop's compute dialog and
// the phone's node screen: the names people know, slices (part of one GPU, one per job) first, and what choosing one
// does to the request (the queue that has it).
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Profile } from '../../types/clusters'

export type Gpu = {
  type: string  // Slurm's gres type; '' = any GPU
  label: string
  memory_gb: number
  slice: boolean
  partitions: string[]
  max_per_job: number
}

export function useGpus(cluster: string) {
  const [gpus, setGpus] = useState<Gpu[]>([])
  const [known, setKnown] = useState(false)
  useEffect(() => {
    call<{ known: boolean; gpus: Gpu[] }>('clusters.gpus', { cluster })
      .then((r) => { setGpus(r.gpus); setKnown(r.known) }).catch(() => setGpus([]))
  }, [cluster])
  return { gpus, known }
}

/** The name with its memory: "A100, 10 GB slice", "H100, 80 GB". */
export function gpuName(g: Gpu) {
  return g.slice || !g.memory_gb ? g.label : `${g.label}, ${g.memory_gb} GB`
}

/** The line under its name: how many one job can have ("Up to 8 per job"); '' for a slice, whose name says it. */
export function gpuHint(g: Gpu) {
  return g.slice || g.max_per_job <= 1 ? '' : `Up to ${g.max_per_job} per job`
}

/** Each GPU's line, only where it differs from the usual one ("Up to 8 per job" when the rest allow 4). */
export function gpuHints(gpus: Gpu[]): string[] {
  const all = gpus.map(gpuHint)
  const count = new Map<string, number>()
  all.filter(Boolean).forEach((h) => count.set(h, (count.get(h) ?? 0) + 1))
  const usual = [...count].sort((a, b) => b[1] - a[1])[0]?.[0]
  return all.map((h) => (h === usual ? '' : h))
}

// Names people know for Slurm's GPU types, as in hpc_hub/compute/gpus.py, for rows that have no GPU list at hand.
const NAMES: Record<string, string> = {
  a100: 'A100', a100_10g: 'A100, 10 GB slice', a100_20g: 'A100, 20 GB slice', a100_40g: 'A100, 40 GB slice',
  a100_80gb: 'A100', v100: 'V100', h100: 'H100', h200: 'H200', b200: 'B200', l40s: 'L40S', a40: 'A40',
  a5000: 'RTX A5000', rtx_5000_ada: 'RTX 5000 Ada', rtx_pro_6000_blackwell: 'RTX PRO 6000 Blackwell',
}

/** "A100, 10 GB slice", "2 × H100", "2 × V100" (SDSC names none): never a bare count. */
export function gpuAmount(count: number, type = '', cluster = '') {
  const name = NAMES[type] ?? (type ? type.replace(/_/g, ' ').toUpperCase() : cluster === 'sdsc' ? 'V100' : 'GPU')
  return count === 1 && /slice/.test(name) ? name : `${count} × ${name}`
}

/** The GPU a profile asks for, or null for none. */
export function chosen(p: Profile, gpus: Gpu[]): Gpu | null {
  if (!p.gpus) return null
  return gpus.find((g) => g.type === (p.gpu_type ?? '')) ?? null
}

/** The profile with this GPU (null = no GPU): count kept in range, the queue moved to one that has it. */
export function withGpu(p: Profile, g: Gpu | null, count = 1): Profile {
  if (!g) return { ...p, gpus: 0, gpu_type: '' }
  const n = g.slice ? 1 : Math.min(Math.max(1, count), g.max_per_job || 1)
  const partition = g.partitions.length && !g.partitions.includes(p.partition) ? g.partitions[0] : p.partition
  return { ...p, gpus: n, gpu_type: g.type, partition }
}

export type Preset = { id: string; label: string; hint: string; apply: (p: Profile) => Profile }

/** Quick sizes: small, medium, and the smallest GPU the cluster has (a slice where there is one). */
export function presets(gpus: Gpu[]): Preset[] {
  const out: Preset[] = [
    { id: 'small', label: 'Small', hint: '2 cores · 8 GB', apply: (p) => withGpu({ ...p, cpus: 2, mem_gb: 8 }, null) },
    { id: 'medium', label: 'Medium', hint: '8 cores · 32 GB',
      apply: (p) => withGpu({ ...p, cpus: 8, mem_gb: 32 }, null) },
  ]
  const g = gpus[0]
  if (g) out.push({ id: 'gpu', label: g.slice ? `GPU ${g.memory_gb} GB` : `1 × ${g.label.replace(/^RTX /, '')}`, hint: gpuName(g),
    apply: (p) => withGpu({ ...p, cpus: 4, mem_gb: 16 }, g) })
  return out
}

/** Whether the profile already is this quick size. */
export function isPreset(p: Profile, x: Preset) {
  const q = x.apply(p)
  return q.cpus === p.cpus && q.mem_gb === p.mem_gb && (q.gpus ?? 0) === (p.gpus ?? 0)
    && (q.gpu_type ?? '') === (p.gpu_type ?? '')
}

/** "A100, 10 GB slice" / "2 × H100" / "" for none. */
export function gpuSummary(p: Profile, gpus: Gpu[]) {
  if (!p.gpus) return ''
  const g = chosen(p, gpus)
  const name = g ? g.label : p.gpu_type || 'GPU'
  return p.gpus === 1 ? name : `${p.gpus} × ${name}`
}
