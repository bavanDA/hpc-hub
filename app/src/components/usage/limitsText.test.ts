import { describe, expect, it } from 'vitest'

import type { Billing } from '../../types/clusters'
import { capsText, costText, factorText } from './limitsText'

const bill = (change: Partial<Billing> = {}): Billing => ({ weights: { cpu: 1 }, max: 'all', factor: 1, ...change })

describe('costText', () => {
  it('turns Expanse billing into SUs', () =>
    expect(costText(bill({ weights: { cpu: 3600, mem: 1800 }, per_su: 3600 }), false))
      .toEqual({ value: '1 SU per core', sub: 'or 0.5 per GB if that is more' }))
  it('says a whole node is billed', () =>
    expect(costText(bill({ weights: { cpu: 3600, node: 460800 }, per_su: 3600 }), true).value).toBe('128 SU per node'))
  it('leads with the GPU where the GPU costs most', () =>
    expect(costText(bill({ weights: { gpu: 3600, cpu: 360 }, per_su: 3600 }), false))
      .toEqual({ value: '1 SU per GPU', sub: 'or 0.1 per core if that is more' }))
  it('lists what each GPU adds', () =>
    expect(costText(bill({ weights: { cpu: 1, gpu: 0, 'gpu:a100': 16 }, max: 'gres' }), false, true).sub)
      .toBe('GPUs add a100 16'))
  it('leaves out GPU prices on a queue with no GPUs', () =>
    expect(costText(bill({ weights: { cpu: 1, gpu: 0, 'gpu:a100': 16 }, max: 'gres' }), false).sub).toBe(''))
  it('says free', () => expect(costText(bill({ factor: 0 }), false).value).toBe('Free'))
  it('says when Slurm sets no price', () => expect(costText(null, false).value).toBe('Not listed'))
})

describe('capsText', () => {
  it('reads cores, nodes, memory and GPUs', () =>
    expect(capsText({ cpu: 4096, node: 32, mem: 16, 'gpu:a100': 2 })).toBe('4,096 cores, 32 nodes, 16 GB, 2 × a100'))
  it('says a GPU is not allowed', () => expect(capsText({ 'gpu:l40': 0 })).toBe('no l40'))
  it('is empty with no caps', () => expect(capsText({})).toBe(''))
})

it('factorText', () => {
  expect([factorText(0), factorText(1), factorText(2)]).toEqual(['Free', 'Normal', '2x'])
})
