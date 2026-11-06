import { describe, expect, it } from 'vitest'

import type { CopyPlan, CopyTarget, CopyTargets } from '../../types/projects'
import { defaultTarget, measureNote } from './copyPlan'

const target = (id: string, over: Partial<CopyTarget> = {}): CopyTarget =>
  ({ id, name: id, connected: true, globus_missing: '', ...over })
const targets = (over: Partial<CopyTargets> = {}): CopyTargets =>
  ({ name: 'thesis', copy_to: '', copy_into: '', targets: [target('wulver', { same: true }), target('yale')], ...over })

describe('defaultTarget', () => {
  it('takes the last target', () => expect(defaultTarget(targets({ copy_to: 'wulver' }))?.id).toBe('wulver'))
  it('else another cluster', () => expect(defaultTarget(targets())?.id).toBe('yale'))
  it('else the project\'s own', () =>
    expect(defaultTarget(targets({ targets: [target('wulver', { same: true })] }))?.id).toBe('wulver'))
})

describe('measureNote', () => {
  const plan = { parts: [], chats: [], parts_error: '', chats_error: '' } as CopyPlan
  it('measures until the plan is in', () => expect(measureNote('', null)).toBe('Measuring sizes'))
  it('asks what stays behind', () => expect(measureNote('', plan)).toBe('Untick what stays behind.'))
  it('says why it could not measure', () => {
    expect(measureNote('timed out', null)).toBe('Could not measure it: timed out')
    expect(measureNote('', { ...plan, parts_error: 'no access' })).toBe('Could not measure it: no access')
  })
})
