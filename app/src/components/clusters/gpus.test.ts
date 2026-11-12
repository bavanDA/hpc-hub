import { describe, expect, it } from 'vitest'

import type { Profile } from '../../types/clusters'
import { chosen, fitting, gpuAmount, gpuName, gpuSummary, isPreset, presets, withGpu, type Gpu } from './gpus'

const gpu = (change: Partial<Gpu>): Gpu =>
  ({ type: 'a100', label: 'A100', memory_gb: 80, slice: false, partitions: ['gpu'], max_per_job: 4, ...change })
const slice = gpu({ type: 'a100_10g', label: 'A100, 10 GB slice', memory_gb: 10, slice: true, max_per_job: 1 })
const l40 = gpu({ type: 'l40', label: 'L40', memory_gb: 48, max_per_job: 2 })
const size: Profile = { cpus: 4, mem_gb: 16, time: '01:00:00', partition: 'general' }

describe('names', () => {
  it('adds memory to a whole GPU', () => expect(gpuName(gpu({}))).toBe('A100, 80 GB'))
  it('keeps a slice as named', () => expect(gpuName(slice)).toBe('A100, 10 GB slice'))
  it.each([
    [1, 'a100_10g', '', 'A100, 10 GB slice'],
    [2, 'h100', '', '2 × H100'],
    [2, '', 'V100', '2 × V100'],  // a cluster whose GPUs have no type names them
    [1, 'new_card', '', '1 × NEW CARD'],
  ])('gpuAmount(%s, %s, %s)', (n, type, untyped, want) => expect(gpuAmount(n, type, untyped)).toBe(want))
  it('sums up a profile', () => {
    expect(gpuSummary({ ...size, gpus: 2, gpu_type: 'l40' }, [l40])).toBe('2 × L40')
    expect(gpuSummary(size, [l40])).toBe('')
  })
})

describe('withGpu', () => {
  it('moves to a queue that has the GPU', () =>
    expect(withGpu(size, l40, 5)).toMatchObject({ gpus: 2, gpu_type: 'l40', partition: 'gpu' }))
  it('takes one slice', () => expect(withGpu(size, slice, 3).gpus).toBe(1))
  it('clears the GPU', () => expect(withGpu({ ...size, gpus: 2, gpu_type: 'l40' }, null))
    .toMatchObject({ gpus: 0, gpu_type: '' }))
  it('finds the chosen one', () => {
    expect(chosen({ ...size, gpus: 1, gpu_type: 'l40' }, [slice, l40])).toBe(l40)
    expect(chosen(size, [l40])).toBeNull()
  })
})

describe('fitting', () => {
  it('puts the fewest GPUs first', () =>
    expect(fitting(60, [l40, gpu({})]).map((f) => [f.gpu.type, f.count])).toEqual([['a100', 1], ['l40', 2]]))
  it('skips a slice too small and a count over the limit', () =>
    expect(fitting(200, [slice, l40, gpu({})]).map((f) => f.gpu.type)).toEqual(['a100']))
  it('puts a blocked type last', () =>
    expect(fitting(40, [l40, gpu({})], { l40: 0 }).map((f) => [f.gpu.type, f.blocked]))
      .toEqual([['a100', false], ['l40', true]]))
})

describe('presets', () => {
  it('offers the first GPU as the GPU size', () => {
    const quick = presets([slice, l40])
    expect(quick.map((p) => p.id)).toEqual(['small', 'medium', 'gpu'])
    expect(quick[2].hint).toBe('A100, 10 GB slice · 4 cores · 16 GB')
  })
  it('knows when a profile is a quick size', () => {
    const [small, medium] = presets([])
    expect(isPreset({ ...size, cpus: 2, mem_gb: 8 }, small)).toBe(true)
    expect(isPreset(size, medium)).toBe(false)
  })
})
