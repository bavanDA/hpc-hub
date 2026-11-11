import { describe, expect, it } from 'vitest'

import type { Billing, Profile } from '../../types/clusters'
import { suPerHour, suText } from './su'

const size = (change: Partial<Profile> = {}): Profile =>
  ({ cpus: 16, mem_gb: 63, time: '01:00:00', partition: 'general', ...change })
const bill = (change: Partial<Billing> = {}): Billing =>
  ({ weights: { cpu: 1, mem: 0.25, gpu: 0, 'gpu:a100': 4 }, max: 'gres', factor: 1, ...change })

describe('suPerHour', () => {
  it('drops the fraction', () => expect(suPerHour(bill(), size())).toBe(16))
  it('adds GPUs to the bigger of cores and memory', () =>
    expect(suPerHour(bill(), size({ gpus: 2, gpu_type: 'a100' }))).toBe(24))
  it('takes the biggest part with max all', () =>
    expect(suPerHour(bill({ max: 'all' }), size({ cpus: 2, gpus: 4, gpu_type: 'a100' }))).toBe(16))
  it('adds every part without a max', () => expect(suPerHour(bill({ max: '' }), size())).toBe(31))
  it('turns Expanse billing into SUs', () => {
    const shared = bill({ weights: { cpu: 3600, mem: 1800 }, max: 'all', per_su: 3600 })
    expect(suPerHour(shared, size({ cpus: 4, mem_gb: 16 }))).toBe(8)
  })
  it('charges the whole node where whole nodes are billed', () => {
    const compute = bill({ weights: { cpu: 3600, mem: 1800, node: 460800 }, max: 'all', per_su: 3600 })
    expect(suPerHour(compute, size({ cpus: 2, mem_gb: 8 }))).toBe(128)
  })
})

describe('suText', () => {
  it('says how much the whole time can take', () =>
    expect(suText(bill({ factor: 2 }), size(), 90, 'standard'))
      .toEqual({ value: 'Up to 48 SU', sub: '32 SU an hour, only for the time it runs' }))
  it('calls a free priority free', () =>
    expect(suText(bill({ factor: 0 }), size(), 60, 'low').sub)
      .toBe('No SUs with the low priority. A paid one: 16 SU an hour'))
  it('calls a free queue free', () =>
    expect(suText(bill({ factor: 0, free: 'partition' }), size(), 60, '').value).toBe('Free'))
  it('rounds small amounts to one decimal', () =>
    expect(suText(bill({ factor: 0.5 }), size({ cpus: 3, mem_gb: 4 }), 30, 'x').value).toBe('Up to 0.8 SU'))
})
