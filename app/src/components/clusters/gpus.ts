import type { Profile } from '../../types/clusters'

export type Gpu = {
  type: string  // Slurm's gres type; '' = any GPU
  label: string
  memory_gb: number
  slice: boolean
  partitions: string[]
  max_per_job: number
}

/** The name with its memory: "A100, 10 GB slice", "H100, 80 GB". */
export function gpuName(g: Gpu) {
  return g.slice || !g.memory_gb ? g.label : `${g.label}, ${g.memory_gb} GB`
}

// for rows without a GPU list at hand; the backend has the same names
const NAMES: Record<string, string> = {
  a100: 'A100', a100_10g: 'A100, 10 GB slice', a100_20g: 'A100, 20 GB slice', a100_40g: 'A100, 40 GB slice',
  a100_80gb: 'A100', v100: 'V100', h100: 'H100', h200: 'H200', b200: 'B200', l40: 'L40', l40s: 'L40S', a40: 'A40',
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

/** One way to get the GPU memory you need: count of this GPU. blocked: the priority you picked doesn't allow it. */
export type GpuFit = { gpu: Gpu; count: number; blocked: boolean }

/** The GPUs that give at least need GB on one node, fewest GPUs first, then the least memory left over. caps are
 *  the priority's (clusters.partitions gpu_caps): {"l40": 0} blocks a type, {"": 1} caps the count. */
export function fitting(need: number, gpus: Gpu[], caps: Record<string, number> = {}): GpuFit[] {
  const out: GpuFit[] = []
  for (const g of gpus) {
    const count = !g.memory_gb || g.slice ? 1 : Math.max(1, Math.ceil(need / g.memory_gb))
    if (g.memory_gb && count * g.memory_gb < need) continue  // a slice too small
    if (count > Math.min(g.max_per_job || 1, caps[''] ?? Infinity)) continue
    out.push({ gpu: g, count, blocked: caps[g.type] === 0 })
  }
  const total = (f: GpuFit) => f.count * (f.gpu.memory_gb || 999)
  return out.sort((a, b) => Number(a.blocked) - Number(b.blocked) || a.count - b.count || total(a) - total(b))
}

export type Preset = { id: string; label: string; hint: string; apply: (p: Profile) => Profile }

/** Quick sizes, named by what you get: 2 cores, 8 cores, and GPU (the smallest one the cluster has: a slice where
 *  there is one). */
export function presets(gpus: Gpu[]): Preset[] {
  const out: Preset[] = [
    { id: 'small', label: '2 cores', hint: '2 cores · 8 GB', apply: (p) => withGpu({ ...p, cpus: 2, mem_gb: 8 }, null) },
    { id: 'medium', label: '8 cores', hint: '8 cores · 32 GB',
      apply: (p) => withGpu({ ...p, cpus: 8, mem_gb: 32 }, null) },
  ]
  const g = gpus[0]
  if (g) out.push({ id: 'gpu', label: 'GPU', hint: `${gpuName(g)} · 4 cores · 16 GB`,
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
