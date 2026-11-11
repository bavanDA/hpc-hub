import { describe, expect, it } from 'vitest'

import type { Maintenance } from '../../../types/clusters'
import { runsInto, shortened, whenText } from './maintenance'

const m = (change: Partial<Maintenance> = {}): Maintenance =>
  ({ start: '2026-11-10T07:50:00', tz: 'EST', minutes_left: 2345, active: false, ...change })

describe('maintenance', () => {
  it('leaves a margin, in whole 5 minutes', () => expect(shortened(2345)).toBe(2335))
  it('has no time to give when too close', () => expect(shortened(8)).toBe(0))
  it('warns only a job that would run into it', () => {
    expect(runsInto(m(), 4320)).toBe(true)
    expect(runsInto(m(), 240)).toBe(false)
    expect(runsInto(m({ active: true, minutes_left: 0 }), 60)).toBe(true)
  })
  it('says when on the cluster clock', () => expect(whenText(m())).toBe('Tue, Nov 10 at 7:50 AM EST'))
})
