import { describe, expect, it } from 'vitest'

import type { FileClass, Plan, PlanItem, Scan } from '../../types/backup'
import { leaveOutBiggest, planParams, scanRunning, watchedId } from './flow'

const GB = 1024 ** 3

describe('scanRunning', () => {
  it.each([['scanning', true], ['thinking', true], ['waiting_for_node', true], ['done', false], ['failed', false]])(
    'a check that is %s runs: %s', (state, want) => expect(scanRunning({ state } as Scan)).toBe(want))
  it('is false without a check', () => expect(scanRunning(null)).toBe(false))
})

describe('watchedId', () => {
  const k = { scan: 's1', copy: 'c1', tried: '' }
  it('follows the copy while it runs', () => expect(watchedId('copy', k)).toBe('c1'))
  it('follows the check during its trial run', () => expect(watchedId('space', { ...k, tried: 'running' })).toBe('s1'))
  it('follows nothing once the trial ran', () => expect(watchedId('space', { ...k, tried: 'yes' })).toBe(''))
  it('follows nothing on other steps', () => expect(watchedId('plan', { ...k, tried: 'running' })).toBe(''))
})

describe('planParams', () => {
  it('names the scope and passes the choices', () => {
    const changes = [{ path: 'run1', keep: false }]
    expect(planParams('wulver', 's1', { horizon: 7, whole: true, everything: false, codeToHome: true }, changes))
      .toEqual({ cluster: 'wulver', id: 's1', horizon_days: 7, scope: 'at_risk', whole_folders: true,
        code_to_home: true, changes })
    expect(planParams('wulver', 's1', { horizon: 7, whole: false, everything: true, codeToHome: false }, []).scope)
      .toBe('everything')
  })
})

describe('leaveOutBiggest', () => {
  const item = (folder: string, kind: FileClass, gb: number) => ({ folder, kind, bytes: gb * GB }) as PlanItem
  const plan = (overGb: number, items: PlanItem[]) =>
    ({ space: { after_gb: 100 + overGb, quota_gb: 100 }, items }) as Plan
  const items = [item('code', 'code', 50), item('small', 'regen', 2), item('big', 'checkpoint', 8),
    item('maybe', 'unsure', 5)]

  it('leaves out what can be made again, biggest first, until it fits', () =>
    expect(leaveOutBiggest(plan(10, items))).toEqual([
      { path: 'big', class: 'checkpoint', keep: false }, { path: 'maybe', class: 'unsure', keep: false }]))
  it('leaves out at least one even when it already fits', () =>
    expect(leaveOutBiggest(plan(-5, items)).map((c) => c.path)).toEqual(['big']))
  it('never leaves out results or code', () =>
    expect(leaveOutBiggest(plan(500, items)).map((c) => c.path)).toEqual(['big', 'maybe', 'small']))
  it('has nothing to leave out', () => expect(leaveOutBiggest(plan(10, [item('code', 'code', 50)]))).toEqual([]))
})
