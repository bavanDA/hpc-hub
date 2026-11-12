import type { Limits, Profile } from '../../../types/clusters'
import { inRange } from '../../e/range'
import { gpuName, isPreset, type Gpu, type GpuFit, type Preset } from '../gpus'
import { minutes } from '../time'

/** The fewest cores this much memory takes where each core comes with perCore GB. */
export const coresFor = (mem: number, perCore?: number | null) => (perCore ? Math.max(1, Math.ceil(mem / perCore)) : 1)

export const fits = (p: Profile, limits: Limits | null, g: Gpu | null) =>
  inRange(p.cpus, coresFor(p.mem_gb, limits?.mem_per_core_gb), limits?.cores) && inRange(p.mem_gb, 1, limits?.memory_gb)
  && inRange(minutes(p.time) ?? 0, 1, limits?.longest) && (!g || inRange(p.gpus ?? 1, 1, g.max_per_job))
  && (!g || limits?.gpu_caps?.[g.type] !== 0)
  && !limits?.qos_refused  // Slurm would take the job and keep it waiting forever
  && !(limits?.needs_gpu && !p.gpus)  // a GPU-only queue refuses a job without one

export const sizeOf = (p: Profile, quick: Preset[], last?: string) =>
  (last && (last === 'gpu') === !!p.gpus ? last : null)
  ?? quick.find((x) => isPreset(p, x))?.id
  ?? (p.gpus ? 'gpu' : p.cpus >= 8 ? 'medium' : 'small')

export const fitName = (f: GpuFit) =>
  (f.count === 1 ? gpuName(f.gpu) : `${f.count} × ${f.gpu.label}, ${f.count * f.gpu.memory_gb} GB`)
