import { describe, expect, it } from 'vitest'

import { cores, gpuText, summary, type Profile } from './clusters'

const size: Profile = { cpus: 4, mem_gb: 16, time: '04:00:00', partition: 'general' }

describe('summary', () => {
  it('lists cores, memory and time', () => expect(summary(size)).toBe('4 cores · 16 GB · 4 h'))
  it('shortens days and minutes', () => expect(summary({ ...size, time: '1-12:30:00' })).toBe('4 cores · 16 GB · 1 d 12 h 30 min'))
  it('keeps a time it cannot read', () => expect(summary({ ...size, cpus: 1, time: 'x' })).toBe('1 core · 16 GB · x'))
  it('adds the GPU', () => expect(summary({ ...size, gpus: 1, gpu_type: 'a100' })).toBe('4 cores · 16 GB · 4 h · A100'))
})

describe('gpuText', () => {
  it.each([
    [0, 'a100', ''],
    [1, 'a100_10g', 'A100 10 GB slice'],
    [2, 'h100', '2 × H100'],
    [1, '', 'GPU'],
    [1, 'rtx_5000_ada', 'RTX 5000 ADA'],
  ])('%s × %s', (gpus, gpu_type, want) => expect(gpuText({ ...size, gpus, gpu_type })).toBe(want))
})

describe('cores', () => {
  it('says one core', () => expect(cores(1)).toBe('1 core'))
  it('says many cores', () => expect(cores('8')).toBe('8 cores'))
})
