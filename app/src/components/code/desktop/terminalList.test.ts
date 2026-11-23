import { afterEach, describe, expect, it, vi } from 'vitest'

import { listShown, rememberList } from './terminalList'

describe('the terminal list is remembered on this computer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shown until you hide it, then hidden at the next start too', () => {
    const kept = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => { kept.set(k, v) } })
    expect(listShown()).toBe(true)
    rememberList(false)
    expect(listShown()).toBe(false)
    rememberList(true)
    expect(listShown()).toBe(true)
  })

  it('without storage (a private window) it shows, and hiding still works for the visit', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } })
    expect(listShown()).toBe(true)
    expect(() => rememberList(false)).not.toThrow()
  })
})
