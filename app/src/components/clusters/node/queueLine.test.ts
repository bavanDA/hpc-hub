import { describe, expect, it } from 'vitest'

import type { GuideQueue } from '../../../types/usage'
import { queueHint, queueLine } from './queueLine'

const queue = (over: Partial<GuideQueue> = {}): GuideQueue => ({
  name: 'compute', default: false, up: true, nodes: 100, longest: 2880, default_time: null, max_nodes: 32, cores: 4096,
  cores_per_node: 128, memory_gb: 243, mem_per_core_gb: null, default_mem_per_core_gb: null, gpus: [],
  whole_nodes: false, can_be_stopped: false,
  billing: { factor: 1, max: '', weights: { cpu: 1 } } as GuideQueue['billing'], ...over,
})

describe('queueLine', () => {
  it('says up to for time, cores and memory, then the cost', () =>
    expect(queueLine(queue())).toMatch(/^Up to .+ · up to 4,096 cores · up to 243 GB memory per node · 1 SU per core$/))
  it('drops per node on a queue of one node', () => expect(queueLine(queue({ max_nodes: 1 }))).toContain('243 GB memory ·'))
  it('leaves out what Slurm did not say', () =>
    expect(queueLine(queue({ longest: null, memory_gb: null, billing: null }))).toBe('Up to 4,096 cores'))
})

describe('queueHint', () => {
  it('explains whole nodes in plain words', () =>
    expect(queueHint(queue({ whole_nodes: true }))).toContain('You always get whole nodes, even if you ask for fewer cores'))
  it('warns when other jobs can stop yours', () =>
    expect(queueHint(queue({ can_be_stopped: true }))).toContain('Other jobs can stop yours'))
})
