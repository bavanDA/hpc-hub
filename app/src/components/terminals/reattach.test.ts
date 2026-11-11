import { describe, expect, it } from 'vitest'

import { nextStep } from './reattach'

describe('nextStep', () => {
  it('waits for a cluster it cannot reach', () => expect(nextStep(false, false, 255, 60_000)).toBe('wait'))
  it('says so when the session is over', () => expect(nextStep(true, false, 1, 60_000)).toBe('gone'))
  it('attaches again after a lost connection', () => expect(nextStep(true, true, 255, 60_000)).toBe('attach'))
  it('does not undo leaving on purpose', () => expect(nextStep(true, true, 0, 60_000)).toBe('offer'))
  it('does not loop when attaching fails at once', () => expect(nextStep(true, true, 255, 400)).toBe('offer'))
})
