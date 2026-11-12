import { describe, expect, it } from 'vitest'

import type { Limits, Profile } from '../../../types/clusters'
import type { Gpu, Preset } from '../gpus'
import { coresFor, fitName, fits, sizeOf } from './fit'

const profile = (p: Partial<Profile> = {}): Profile =>
  ({ cpus: 2, mem_gb: 8, time: '04:00:00', partition: 'general', ...p })
const limits = (l: Partial<Limits> = {}): Limits => ({
  known: true, partitions: ['general'], default_partition: 'general', qos: [], default_qos: '', longest: 480, why: '',
  cores: 32, memory_gb: 128, ...l,
})
const gpu = (g: Partial<Gpu> = {}): Gpu => ({
  type: 'a100', label: 'A100', memory_gb: 40, slice: false, partitions: ['gpu'], max_per_job: 4, ...g,
})

describe('coresFor', () => {
  it('takes one core without a memory per core', () => {
    expect(coresFor(64)).toBe(1)
    expect(coresFor(64, null)).toBe(1)
  })

  it('rounds up to the cores the memory needs', () => {
    expect(coresFor(16, 4)).toBe(4)
    expect(coresFor(17, 4)).toBe(5)
    expect(coresFor(1, 4)).toBe(1)
  })
})

describe('fits', () => {
  it('takes a profile inside the limits', () => {
    expect(fits(profile(), limits(), null)).toBe(true)
    expect(fits(profile(), null, null)).toBe(true)
  })

  it('stops at the cores, memory and time', () => {
    expect(fits(profile({ cpus: 33 }), limits(), null)).toBe(false)
    expect(fits(profile({ mem_gb: 129 }), limits(), null)).toBe(false)
    expect(fits(profile({ time: '09:00:00' }), limits(), null)).toBe(false)
  })

  it('a GPU-only queue needs a GPU, and a refused priority never fits', () => {
    expect(fits(profile({ gpus: 0 }), limits({ needs_gpu: true }), null)).toBe(false)
    expect(fits(profile({ gpus: 0 }), limits({ qos_refused: 'The debug queue takes priority debug, not low.' }), null))
      .toBe(false)
  })

  it('needs enough cores for the memory', () => {
    expect(fits(profile({ cpus: 1, mem_gb: 16 }), limits({ mem_per_core_gb: 4 }), null)).toBe(false)
    expect(fits(profile({ cpus: 4, mem_gb: 16 }), limits({ mem_per_core_gb: 4 }), null)).toBe(true)
  })

  it('checks the GPU count and the priority caps', () => {
    expect(fits(profile({ gpus: 4 }), limits(), gpu())).toBe(true)
    expect(fits(profile({ gpus: 5 }), limits(), gpu())).toBe(false)
    expect(fits(profile({ gpus: 1 }), limits({ gpu_caps: { a100: 0 } }), gpu())).toBe(false)
  })
})

describe('sizeOf', () => {
  const quick: Preset[] = [
    { id: 'small', label: '2 cores', hint: '', apply: (p) => ({ ...p, cpus: 2, mem_gb: 8, gpus: 0, gpu_type: '' }) },
  ]

  it('keeps the last size when it still matches CPU or GPU', () => {
    expect(sizeOf(profile({ cpus: 16 }), quick, 'medium')).toBe('medium')
    expect(sizeOf(profile({ gpus: 1 }), quick, 'gpu')).toBe('gpu')
  })

  it('finds a quick size, else guesses from the profile', () => {
    expect(sizeOf(profile(), quick)).toBe('small')
    expect(sizeOf(profile({ cpus: 8, mem_gb: 32 }), quick)).toBe('medium')
    expect(sizeOf(profile({ cpus: 4, mem_gb: 16 }), quick)).toBe('small')
    expect(sizeOf(profile({ gpus: 2 }), quick, 'small')).toBe('gpu')
  })
})

describe('fitName', () => {
  it('names one GPU with its memory', () => {
    expect(fitName({ gpu: gpu(), count: 1, blocked: false })).toBe('A100, 40 GB')
  })

  it('counts several GPUs and their memory', () => {
    expect(fitName({ gpu: gpu(), count: 2, blocked: false })).toBe('2 × A100, 80 GB')
  })
})
