import { describe, expect, it } from 'vitest'

import { countText } from './search'

describe('countText', () => {
  const c = (index: number, total: number, capped = false, invalid = false) => ({ index, total, capped, invalid })
  it.each([
    [c(0, 0), 'No matches'],
    [c(0, 1), '1 match'],
    [c(0, 12), '12 matches'],
    [c(3, 12), '3 of 12'],
    [c(0, 1000, true), '1000+ matches'],
    [c(2, 1000, true), '2 of 1000+'],
    [c(0, 0, false, true), 'Not a valid pattern'],
  ])('%o reads %s', (count, want) => expect(countText(count)).toBe(want))
})
