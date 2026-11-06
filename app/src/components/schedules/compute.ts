import type { Profile } from '../../types/clusters'
import type { Compute } from '../../types/schedules'

export type OwnCompute = Required<Compute>

export const ownFrom = (p: Profile, c: Compute): OwnCompute => ({ cpus: c.cpus ?? p.cpus, mem_gb: c.mem_gb ?? p.mem_gb,
  gpus: c.gpus ?? p.gpus ?? 0, gpu_type: c.gpu_type ?? p.gpu_type ?? '', partition: c.partition ?? p.partition, account: c.account ?? p.account ?? '',
  qos: c.qos ?? p.qos ?? '' })
