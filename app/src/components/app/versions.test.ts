import { describe, expect, it } from 'vitest'

import { gone, newer, replaces, takesOver } from './versions'

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

// 2026-11-23: fix 32 couldn't install (an older backend left by the installer); the error stayed and the beta that
// came out after it was never offered until HPC Hub restarted
describe('a quiet check\'s offer', () => {
  const failed = { kind: 'error', version: '0.2.7-beta.61 fix 32', text: 'The update didn\'t install' }
  it('takes the place of an offer that failed to install, when newer', () => {
    expect(takesOver('0.2.7-beta.62', failed)).toBe(true)
    expect(takesOver('0.2.7-beta.61 fix 33', failed)).toBe(true)
  })
  it('does not bring the same failed offer back over its error', () =>
    expect(takesOver('0.2.7-beta.61 fix 32', failed)).toBe(false))
  it('replaces a failed check, and nothing yet', () => {
    expect(takesOver('0.2.7-beta.62', { kind: 'error' })).toBe(true)
    expect(takesOver('0.2.7-beta.62', { kind: 'none' })).toBe(true)
    expect(takesOver('0.2.7-beta.62', { kind: 'idle' })).toBe(true)
  })
  it('leaves a download or an install alone', () => {
    for (const kind of ['checking', 'downloading', 'installing']) {
      expect(takesOver('0.2.7-beta.62', { kind, version: '0.2.7-beta.61 fix 32' })).toBe(false)
    }
  })
  it('replaces an offer only with a newer one', () => {
    expect(takesOver('0.2.7-beta.62', { kind: 'available', version: '0.2.7-beta.61 fix 32' })).toBe(true)
    expect(takesOver('0.2.7-beta.61 fix 32', { kind: 'available', version: '0.2.7-beta.62' })).toBe(false)
  })
})
