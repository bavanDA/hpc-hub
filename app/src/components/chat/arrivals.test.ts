// 2026-11-24 report: no animation in the chat. New items come in with a short rise; what was there when the view
// opened, or came while you were away, never does.
import { describe, expect, it } from 'vitest'

import { arrive, rises, type Arrivals } from './arrivals'

const read1 = ['e1'], read2 = ['e1', 'e2'], read3 = ['e1', 'e2', 'e3']

describe('which items rise', () => {
  it('nothing on the first draw, nor what the first read brings (the whole history)', () => {
    let a = arrive(undefined, [], true, null)  // nothing read yet
    expect(a.quiet).toBe(true)
    a = arrive(a, ['u1', 't1', 't2'], true, read1)  // the first read lands
    expect(['u1', 't1', 't2'].some((id) => rises(a, id))).toBe(false)
    a = arrive(a, ['u1', 't1', 't2', 'u2'], true, read2)  // then one arrives while you watch
    expect(rises(a, 'u2')).toBe(true)
    expect(rises(a, 't1')).toBe(false)
  })

  it('a view opened with the conversation already read: still until the next read', () => {
    let a = arrive(undefined, ['u1', 't1'], true, read1)
    expect(rises(a, 'u1')).toBe(false)
    a = arrive(a, ['u1', 't1'], true, read1)  // drawn again, no read yet
    expect(a.quiet).toBe(true)
    a = arrive(a, ['u1', 't1', 't2'], true, read2)  // the first read since it opened: history
    expect(rises(a, 't2')).toBe(false)
    a = arrive(a, ['u1', 't1', 't2', 't3'], true, read3)
    expect(rises(a, 't3')).toBe(true)
  })

  it('a read that changes nothing in the file (a mode switch, an error) does not end the quiet', () => {
    let a = arrive(undefined, ['u1'], true, read1)
    a = arrive(a, ['u1', 'ask:Allow?'], true, read1)
    expect(a.quiet).toBe(true)
    expect(rises(a, 'ask:Allow?')).toBe(false)
    a = arrive(a, ['u1', 'ask:Allow?'], true, read2)
    expect(rises(a, 'ask:Allow?')).toBe(false)  // it showed while quiet: history from then on
  })

  it('switching to another tab and back: what came meanwhile shows still', () => {
    let a = arrive(undefined, [], true, null)
    a = arrive(a, ['u1'], true, read1)
    a = arrive(a, ['u1', 'u2'], true, read2)
    expect(rises(a, 'u2')).toBe(true)
    a = arrive(a, ['u1', 'u2'], false, read2)  // another tab
    a = arrive(a, ['u1', 'u2'], true, read2)  // back
    expect(rises(a, 'u2')).toBe(false)  // never rises again
    a = arrive(a, ['u1', 'u2', 't1', 't2'], true, read3)  // the first read since: what came while away
    expect(rises(a, 't1') || rises(a, 't2')).toBe(false)
  })

  it('drawing the same thing twice changes nothing', () => {
    const first = arrive(undefined, ['u1'], true, read1)
    const landed = arrive(first, ['u1', 'u2'], true, read2)
    expect(arrive(landed, ['u1', 'u2'], true, read2)).toBe(landed)
    const away: Arrivals = arrive(landed, ['u1', 'u2'], false, read2)
    expect(arrive(away, ['u1', 'u2'], false, read2)).toBe(away)
  })
})
