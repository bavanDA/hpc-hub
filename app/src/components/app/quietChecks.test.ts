import { describe, expect, it } from 'vitest'

import { checkDue, HIDDEN_EVERY_MS, quietChecks, SHOWN_EVERY_MS } from './quietChecks'

const MIN = 60_000

/** A clock, a hidden flag, the checks run, and the timer's ticks every minute. */
function setup() {
  const at = { now: 1_000_000, hidden: false }
  const ran: number[] = []
  const q = quietChecks(() => ran.push(at.now), () => at.now, () => at.hidden)
  const minutes = (n: number) => { for (let i = 0; i < n; i++) { at.now += MIN; q.tick() } }
  return { at, ran, q, minutes }
}

describe('checkDue', () => {
  it('every minute while the window shows', () => {
    expect(SHOWN_EVERY_MS).toBe(MIN)
    expect(checkDue(MIN, 0, false)).toBe(true)
    expect(checkDue(30_000, 0, false)).toBe(false)
  })

  it('every 15 minutes while it is hidden', () => {
    expect(HIDDEN_EVERY_MS).toBe(15 * MIN)
    expect(checkDue(MIN, 0, true)).toBe(false)
    expect(checkDue(14 * MIN, 0, true)).toBe(false)
    expect(checkDue(15 * MIN, 0, true)).toBe(true)
  })

  it('a timer that fires a little early still counts', () => {
    expect(checkDue(MIN - 500, 0, false)).toBe(true)
    expect(checkDue(15 * MIN - 500, 0, true)).toBe(true)
  })
})

describe('quietChecks', () => {
  it('checks every minute while the window shows, the first a minute after the start', () => {
    const { ran, q, minutes } = setup()
    q.tick()
    expect(ran).toHaveLength(0)
    minutes(5)
    expect(ran).toHaveLength(5)
  })

  it('checks every 15 minutes while hidden', () => {
    const { at, ran, minutes } = setup()
    at.hidden = true
    minutes(60)
    expect(ran).toHaveLength(4)
  })

  it('checks once right away when the window shows again after a minute or more', () => {
    const { at, ran, q, minutes } = setup()
    at.hidden = true
    minutes(5)
    expect(ran).toHaveLength(0)
    at.hidden = false
    q.shown()
    expect(ran).toEqual([at.now])
    q.shown()  // shown twice (focus and visibilitychange): one check
    expect(ran).toHaveLength(1)
    at.now += 30_000
    q.tick()  // the next tick is under a minute later: no second check
    expect(ran).toHaveLength(1)
  })

  it('no check when the window shows again within the minute', () => {
    const { at, ran, q, minutes } = setup()
    minutes(1)
    expect(ran).toHaveLength(1)
    at.hidden = true
    at.now += 20_000
    at.hidden = false
    q.shown()
    expect(ran).toHaveLength(1)
  })

  it('a shown event while still hidden does nothing', () => {
    const { at, ran, q } = setup()
    at.hidden = true
    at.now += 20 * MIN
    q.shown()
    expect(ran).toHaveLength(0)
  })
})
