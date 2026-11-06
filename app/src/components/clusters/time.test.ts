import { describe, expect, it } from 'vitest'

import { human, minutes, slurmTime } from './time'

describe('minutes', () => {
  it.each([
    ['3-00:00:00', 4320],
    ['8:00:00', 480],
    ['30', 30],
    ['1:30', 2],
    [' 2-01:00 ', 2940],
  ])('%s is %d minutes', (text, want) => expect(minutes(text)).toBe(want))

  it('is null for text that is not a time', () => expect(minutes('soon')).toBeNull())
})

describe('slurmTime', () => {
  it('writes hours under a day', () => expect(slurmTime(90)).toBe('01:30:00'))
  it('writes days past a day', () => expect(slurmTime(1830)).toBe('1-06:30:00'))
  it('never goes below a minute', () => expect(slurmTime(0)).toBe('00:01:00'))
  it('reads back what it writes', () => expect(minutes(slurmTime(4321))).toBe(4321))
})

describe('human', () => {
  it('names days, hours and minutes', () => expect(human(1830)).toBe('1 day 6 h 30 min'))
  it('drops parts that are zero', () => expect(human(4320)).toBe('3 days'))
  it('says 0 min for nothing', () => expect(human(0)).toBe('0 min'))
})
