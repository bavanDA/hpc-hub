import { describe, expect, it } from 'vitest'

import { DUO_OPTIONS, duoMethod, duoWaiting } from './duo'

// 2026-11-19: users without Duo Push (text messages, phone calls, passcodes) could not sign in
describe('the Duo method', () => {
  it('reads what is saved, old answers too', () => {
    expect(duoMethod(undefined)).toBe('push')
    expect(duoMethod('')).toBe('push')
    expect(duoMethod('push2')).toBe('push')
    expect(duoMethod('Phone')).toBe('phone')
    expect(duoMethod('sms')).toBe('sms')
    expect(duoMethod('passcode')).toBe('passcode')
    expect(duoMethod('123456')).toBe('passcode')
    expect(duoMethod('something odd')).toBe('push')
  })
  it('offers the four ways, push first', () => {
    expect(DUO_OPTIONS.map((o) => o.value)).toEqual(['push', 'phone', 'sms', 'passcode'])
  })
  it('the waiting window matches the way: a call says call, a push says push', () => {
    expect(duoWaiting('phone').title).toContain('call')
    expect(duoWaiting('push').text).toContain('Approve')
  })
})
