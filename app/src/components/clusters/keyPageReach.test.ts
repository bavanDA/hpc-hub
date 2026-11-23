// 2026-11-23, owner: "if the user is not on Yale VPN you should only show connect to Yale, and check every second if
// they got connected"
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../rpc', () => ({ call: vi.fn() }))

import { cameUp, EVERY_MS, watchReach } from './keyPageReach'

describe('watching for the key page', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('asks every second and passes each answer on', async () => {
    const answers = [false, false, true]
    const ask = vi.fn(async () => answers.shift() ?? true)
    const seen: boolean[] = []
    const stop = watchReach(ask, (r) => seen.push(r))
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual([false])
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(seen).toEqual([false, false, true])
    expect(EVERY_MS).toBe(1000)
    stop()
    await vi.advanceTimersByTimeAsync(5 * EVERY_MS)
    expect(ask).toHaveBeenCalledTimes(3)  // stopped: no more questions
  })

  it('never asks again before the last question answered', async () => {
    let answer: (r: boolean) => void = () => {}
    const ask = vi.fn(() => new Promise<boolean>((ok) => { answer = ok }))
    const stop = watchReach(ask, () => {})
    await vi.advanceTimersByTimeAsync(5 * EVERY_MS)  // a slow answer (the check waits up to a second)
    expect(ask).toHaveBeenCalledTimes(1)
    answer(false)
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(ask).toHaveBeenCalledTimes(2)
    stop()
  })

  it('goes on asking after a failed question, without an answer from it', async () => {
    const ask = vi.fn().mockRejectedValueOnce(new Error('busy')).mockResolvedValue(true)
    const seen: boolean[] = []
    const stop = watchReach(ask, (r) => seen.push(r))
    await vi.advanceTimersByTimeAsync(EVERY_MS)
    expect(seen).toEqual([true])
    stop()
  })
})

describe('opening the page by itself', () => {
  it('only when the network just came up', () => {
    expect(cameUp(false, true)).toBe(true)
    expect(cameUp(null, true)).toBe(false)  // already there when setup looked: you open it yourself
    expect(cameUp(true, true)).toBe(false)
    expect(cameUp(false, false)).toBe(false)
  })
})
