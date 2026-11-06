import { describe, expect, it } from 'vitest'

import type { Allocation } from '../../types/usage'
import { day, footer, headline, paceLine, tag, timeLeft, weekEnds } from './pace'

const group = (over: Partial<Allocation> = {}): Allocation => ({
  account: 'mygroup', quota: 10_000, used: 4_000, mine: 1_000, period: '', rate: 0, weeks: null, people: {},
  per_day: 100, days_left: 60, runs_out: '2027-01-05', end: '', near: false, ...over,
})

describe('day', () => {
  it('writes month and day', () => expect(day('2027-03-13')).toBe('Mar 13'))
  it('adds the year when asked', () => expect(day('2027-03-13', true)).toBe('Mar 13, 2027'))
})

describe('headline', () => {
  it('counts what is left under a limit', () => expect(headline(group())).toEqual(['6,000', 'SUs left']))
  it('never goes below zero', () => expect(headline(group({ used: 12_000 }))[0]).toBe('0'))
  it('shows the cost where SUs are billed', () =>
    expect(headline(group({ quota: 0, rate: 0.01, period: 'FY27' }))).toEqual(['$40.00', 'this fiscal year']))
  it('counts what was used without a limit', () =>
    expect(headline(group({ quota: 0, period: '2026' }))).toEqual(['4,000', 'SUs used in 2026']))
  it('says so far without a period', () => expect(headline(group({ quota: 0 }))[1]).toBe('SUs used so far'))
})

describe('paceLine', () => {
  const used = '4,000 of 10,000 used.'
  it('says when it is used up', () =>
    expect(paceLine(group({ used: 10_000 })).text).toBe('10,000 of 10,000 used. Nothing left to run on.'))
  it('says when the pace is not known', () =>
    expect(paceLine(group({ per_day: null })).text).toBe(`${used} The pace is not known on this cluster.`))
  it('says when nothing was billed lately', () =>
    expect(paceLine(group({ per_day: 0, days_left: null })).text).toBe(`${used} Nothing billed in the last 4 weeks.`))
  it('says when it lasts past the end', () =>
    expect(paceLine(group({ end: '2026-12-31' })).text).toBe(`${used} At this pace it lasts past the end date.`))
  it('puts a short time in bold', () =>
    expect(paceLine(group({ days_left: 12.4 }))).toEqual({ bold: 'About 12 days left', text: ' at the pace of the last month.' }))
  it('says one day, not days', () => expect(paceLine(group({ days_left: 1.2 })).bold).toBe('About 1 day left'))
  it('says less than a day', () => expect(paceLine(group({ days_left: 0.5 })).bold).toBe('Less than a day left'))
  it('says plenty past a year', () =>
    expect(paceLine(group({ days_left: 400 })).text).toBe(`${used} Plenty for the year at this pace.`))
  it('names the day it runs out', () =>
    expect(paceLine(group()).text).toBe(`${used} At this pace it runs out around Jan 5.`))
  it('gives a monthly cost where SUs are billed', () =>
    expect(paceLine(group({ quota: 0, rate: 0.5, per_day: 10 })).text)
      .toBe('4,000 SUs at $0.5 each. About $150 a month lately.'))
  it('gives a weekly pace without a limit', () =>
    expect(paceLine(group({ quota: 0, period: '2026', per_day: 10 })).text)
      .toBe('4,000 SUs used in 2026, no limit set. About 70 a week lately.'))
})

describe('tag', () => {
  it('is empty when not near', () => expect(tag(group())).toBe(''))
  it('says used up', () => expect(tag(group({ near: true, used: 10_000 }))).toBe('Used up'))
  it('says near the limit', () => expect(tag(group({ near: true }))).toBe('Near the limit'))
})

describe('timeLeft', () => {
  it('puts used up first', () => expect(timeLeft(group({ used: 10_000 }))).toBe(-1))
  it('is the days left', () => expect(timeLeft(group())).toBe(60))
  it('puts idle after unknown and no limit last', () => {
    const idle = timeLeft(group({ days_left: null, per_day: 0 }))
    const unknown = timeLeft(group({ days_left: null, per_day: null }))
    expect(unknown).toBeLessThan(idle)
    expect(idle).toBeLessThan(timeLeft(group({ quota: 0 })))
  })
})

describe('footer', () => {
  it('names you and the end', () =>
    expect(footer(group({ end: '2027-06-30' }), 'jdoe')).toBe('You used 1,000 · ends Jun 30, 2027'))
  it('names someone who used most of it', () =>
    expect(footer(group({ people: { other: 80, jdoe: 20 } }), 'jdoe')).toBe('You used 1,000 · other used 80% lately'))
  it('leaves you out when you used most of it', () =>
    expect(footer(group({ people: { jdoe: 80, other: 20 } }), 'jdoe')).toBe('You used 1,000'))
  it('gives your cost where SUs are billed', () =>
    expect(footer(group({ quota: 0, rate: 0.1 }), 'jdoe')).toBe('You used 1,000 SUs, about $100'))
})

describe('weekEnds', () => {
  it('ends today and steps back a week each', () => {
    const ends = weekEnds(3, new Date(2026, 10, 6, 15))
    expect(ends.map((d) => d.toDateString())).toEqual(
      [new Date(2026, 9, 23), new Date(2026, 9, 30), new Date(2026, 10, 6)].map((d) => d.toDateString()))
  })
})
