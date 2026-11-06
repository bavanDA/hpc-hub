import { describe, expect, it } from 'vitest'

import { dhm, inRange } from './range'

describe('inRange', () => {
  it('needs at least min', () => {
    expect(inRange(0, 1)).toBe(false)
    expect(inRange(1, 1)).toBe(true)
  })

  it('takes no max, null or 0 as no limit', () => {
    expect(inRange(10_000, 1)).toBe(true)
    expect(inRange(10_000, 1, null)).toBe(true)
    expect(inRange(10_000, 1, 0)).toBe(true)
  })

  it('stops at max', () => {
    expect(inRange(240, 1, 240)).toBe(true)
    expect(inRange(241, 1, 240)).toBe(false)
  })
})

describe('dhm', () => {
  it('splits minutes into days, hours and minutes', () => {
    expect(dhm(0)).toEqual([0, 0, 0])
    expect(dhm(90)).toEqual([0, 1, 30])
    expect(dhm(1830)).toEqual([1, 6, 30])
    expect(dhm(4320)).toEqual([3, 0, 0])
  })
})
