import { describe, expect, it } from 'vitest'

import type { Spot } from '../../../../types/history'
import { pickLabel, spotKey } from './picks'

describe('push picks', () => {
  it('pickLabel', () => {
    expect(pickLabel('mine', 'jdoe')).toBe('Keep mine')
    expect(pickLabel('theirs', 'jdoe')).toBe("Keep jdoe's")
    expect(pickLabel('both', 'jdoe')).toBe('Keep both')
    expect(pickLabel('edit', 'jdoe')).toBe('Edit')
  })
  it('spotKey', () => {
    expect(spotKey({ path: 'main.tex', index: 2 } as Spot)).toBe('main.tex#2')
  })
})
