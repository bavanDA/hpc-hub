import { describe, expect, it } from 'vitest'

import { clock } from './clock'

describe('clock', () => {
  it.each([
    [0, '0:00'],
    [9.9, '0:09'],
    [75, '1:15'],
    [3599, '59:59'],
    [3600, '1:00:00'],
    [3725, '1:02:05'],
    [-4, '0:00'],
  ])('%d s is %s', (s, want) => expect(clock(s)).toBe(want))
})
