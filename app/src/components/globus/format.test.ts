import { describe, expect, it } from 'vitest'

import { looksLikeCode, pastedCode, shortDate } from './format'

describe('shortDate', () => {
  const now = new Date(2026, 10, 6)
  it('leaves out this year', () => expect(shortDate('2026-10-21 14:02:11', now)).toBe('Oct 21 14:02'))
  it('shows another year instead of the time', () => expect(shortDate('2025-01-02T08:00:00', now)).toBe('Jan 2 2025'))
  it('keeps text it cannot read', () => expect(shortDate('soon', now)).toBe('soon'))
})

describe('pastedCode', () => {
  it('takes a bare code', () => expect(pastedCode('  abcdEFGH1234  ')).toBe('abcdEFGH1234'))
  it('takes the code from the whole address', () =>
    expect(pastedCode('https://auth.globus.org/v2/web/auth-code?code=xyz789abc')).toBe('xyz789abc'))
  it('refuses other text', () => expect(pastedCode('hello world')).toBe(''))
  it('refuses short words', () => expect(pastedCode('short')).toBe(''))
})

describe('looksLikeCode', () => {
  it('takes a long code', () => expect(looksLikeCode('a'.repeat(24))).toBe(true))
  it('takes the address even with a short code', () =>
    expect(looksLikeCode('https://auth.globus.org/v2/web/auth-code?code=abcd1234')).toBe(true))
  it('passes over a copied word', () => expect(looksLikeCode('password')).toBe(false))
})
