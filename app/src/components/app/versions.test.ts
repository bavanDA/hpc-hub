import { describe, expect, it } from 'vitest'

import { gone, newer, replaces } from './versions'

describe('newer', () => {
  it.each([['0.2.6-beta.1', '0.2.5', true], ['0.2.6', '0.2.6-beta.9', true], ['0.2.6-beta.10', '0.2.6-beta.9', true],
    ['0.2.6-beta.2', '0.2.6', false], ['0.2.5', '0.2.6-beta.1', false], ['0.3.0', '0.2.9', true], ['0.2.5', '0.2.5', false]])(
    '%s after %s: %s', (a, b, want) => expect(newer(a, b)).toBe(want))
})

describe('an update offer that went stale', () => {
  // 2026-11-18: beta.54 was offered, beta.55 replaced its files, and Install failed with a 404 (bug report)
  it('a newer beta replaces the offer shown, an older or the same one does not', () => {
    expect(replaces('0.2.7-beta.55', '0.2.7-beta.54')).toBe(true)
    expect(replaces('0.2.7-beta.54', '0.2.7-beta.54')).toBe(false)
    expect(replaces('0.2.7-beta.53', '0.2.7-beta.54')).toBe(false)
    expect(replaces('0.2.7', '0.2.7-beta.55')).toBe(true)
  })
  it('quick fixes count within their version', () => {
    expect(replaces('0.2.7-beta.55 fix 2', '0.2.7-beta.55 fix 1')).toBe(true)
    expect(replaces('0.2.7-beta.55 fix 1', '0.2.7-beta.55 fix 2')).toBe(false)
    expect(replaces('0.2.7-beta.56', '0.2.7-beta.55 fix 3')).toBe(true)
  })
  it('a download that is gone is told apart from other failures', () => {
    expect(gone(new Error('Download request failed with status: 404 Not Found'))).toBe(true)
    expect(gone('network unreachable')).toBe(false)
  })
})
