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
  if (g) out.push({ id: 'gpu', label: g.slice ? `GPU ${g.memory_gb} GB` : '1 GPU', hint: gpuName(g),
    apply: (p) => withGpu({ ...p, cpus: 4, mem_gb: 16 }, g) })
  return out
}

/** "A100, 10 GB slice" / "2 × H100" / "" for none. */
export function gpuSummary(p: Profile, gpus: Gpu[]) {
  if (!p.gpus) return ''
  const g = chosen(p, gpus)
  const name = g ? g.label : p.gpu_type || 'GPU'
  return p.gpus === 1 ? name : `${p.gpus} × ${name}`
}
