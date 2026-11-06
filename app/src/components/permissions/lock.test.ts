import { describe, expect, it } from 'vitest'

import type { LockConfig, LockStatus } from '../../types/permissions'
import { lockConfig, lockOk } from './lock'

const status = (config: Partial<LockConfig>): LockStatus => ({ set_up: true, locked: false, config, open: 0, log: [] })
const ok: LockConfig = { minutes: 10, tries: 3, logout: true, scancel: true }

describe('lockConfig', () => {
  it('fills in the defaults when nothing is saved', () => expect(lockConfig(status({}))).toEqual(ok))

  it('keeps what is saved, falsy values included', () =>
    expect(lockConfig(status({ minutes: 0, tries: 5, logout: false, scancel: false })))
      .toEqual({ minutes: 0, tries: 5, logout: false, scancel: false }))
})

describe('lockOk', () => {
  it('takes the defaults', () => expect(lockOk(ok)).toBe(true))
  it('takes 0 to 240 minutes', () => {
    expect(lockOk({ ...ok, minutes: 0 })).toBe(true)
    expect(lockOk({ ...ok, minutes: 240 })).toBe(true)
    expect(lockOk({ ...ok, minutes: 241 })).toBe(false)
    expect(lockOk({ ...ok, minutes: -1 })).toBe(false)
  })
  it('takes 1 to 10 tries', () => {
    expect(lockOk({ ...ok, tries: 1 })).toBe(true)
    expect(lockOk({ ...ok, tries: 10 })).toBe(true)
    expect(lockOk({ ...ok, tries: 0 })).toBe(false)
    expect(lockOk({ ...ok, tries: 11 })).toBe(false)
  })
})
