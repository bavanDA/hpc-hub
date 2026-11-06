import { describe, expect, it } from 'vitest'

import type { Purge } from '../../types/backup'
import { done, risk, space } from './copy'

const GB = 1024 ** 3

describe('risk', () => {
  it('counts the files at risk', () => {
    expect(risk.headline(1234, 14)).toBe('1,234 files in scratch will be deleted in the next 14 days')
    expect(risk.headline(0, 14)).toBe('Nothing in scratch gets deleted in the next 14 days')
  })
  it('says when the first ones go', () => {
    expect(risk.sub(2 * GB, 1, null)).toBe('2.0 GB in 1 folder.')
    expect(risk.sub(2 * GB, 3, 0)).toBe('2.0 GB in 3 folders. Some could go any day now.')
    expect(risk.sub(2 * GB, 3, 1)).toBe('2.0 GB in 3 folders. The first ones go tomorrow.')
  })
  it('names how days are counted', () =>
    expect(risk.basis('wulver', { basis: 'atime' } as Purge)).toBe('Days are counted from when each file was last opened.'))
})

describe('space', () => {
  it('says what gets replaced', () => {
    expect(space.replaced(0)).toBe('Nothing in project gets replaced.')
    expect(space.replaced(3)).toMatch(/^3 files in project are older/)
  })
  it('counts busy files', () => {
    expect(space.busy(1)).toBe('1 file is busy and get copied next time.')
    expect(space.busy(2)).toBe('2 files are busy and get copied next time.')
  })
  it('says about when the trial has not run', () => {
    expect(space.uses('3 GB', false)).toBe('This copy uses about 3 GB of your project folder.')
    expect(space.uses('3 GB', true)).toBe('This copy uses 3 GB of your project folder.')
  })
})

describe('done', () => {
  it('names how files were checked', () => {
    expect(done.checked('checksum')).toMatch(/^Every file was checked against/)
    expect(done.checked('size')).toMatch(/^Every file was checked by size and date/)
  })
  it('counts files still being written', () => {
    expect(done.busy(1)).toBe('1 file was still being written by a job. Copy it after the job ends.')
    expect(done.busy(4)).toBe('4 files were still being written by a job. Copy them after the job ends.')
  })
  it('counts files that do not match', () =>
    expect(done.mismatch(1)).toBe('1 file does not match the one in scratch.'))
})
