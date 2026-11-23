import { describe, expect, it } from 'vitest'

import type { Listing } from '../../types/terminals'
import { lookedAt, nextStep } from './reattach'

describe('nextStep', () => {
  it('waits for a cluster it cannot reach', () => expect(nextStep(false, false, false, 255, 60_000)).toBe('wait'))
  it('says so when the session is over', () => expect(nextStep(true, true, false, 1, 60_000)).toBe('gone'))
  it('attaches again after a lost connection', () => expect(nextStep(true, true, true, 255, 60_000)).toBe('attach'))
  it('does not undo leaving on purpose', () => expect(nextStep(true, true, true, 0, 60_000)).toBe('offer'))
  it('does not loop when attaching fails at once', () => expect(nextStep(true, true, true, 255, 400)).toBe('offer'))
  // 2026-11-23: "This session has ended" while it ran on: its node hadn't answered the listing
  it('is unsure, not ended, when the node did not answer', () =>
    expect(nextStep(true, false, false, 255, 60_000)).toBe('unsure'))
  it('attaches when found, whatever the listing says it read', () =>
    expect(nextStep(true, false, true, 255, 60_000)).toBe('attach'))
})

describe('lookedAt', () => {
  const listing = (read?: string[]): Listing => ({ host: 'login1', has_tmux: true, nodes: null, sessions: [], read })
  it('takes the places the listing read', () => {
    expect(lookedAt(listing(['', 'n0006']), 'n0006')).toBe(true)
    expect(lookedAt(listing(['', 'n0006']), 'n0007')).toBe(false)
    expect(lookedAt(listing(['n0006']), '')).toBe(false)  // the login node gave nothing
  })
  it('trusts a backend that does not say', () => expect(lookedAt(listing(), 'n0007')).toBe(true))
})
