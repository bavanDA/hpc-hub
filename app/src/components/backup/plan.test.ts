import { describe, expect, it } from 'vitest'

import type { Folder, Summary } from '../../types/backup'
import { groupsOf, inScratch } from './plan'

describe('inScratch', () => {
  const places = [{ label: 'Home', path: '/home/jdoe' }, { label: 'Scratch', path: '/scratch/jdoe' }]
  it.each([['/scratch/jdoe', true], ['/scratch/jdoe/run1', true], ['/scratch/jdoe2', false], ['/home/jdoe', false]])(
    '%s is in scratch: %s', (path, want) => expect(inScratch(path, places)).toBe(want))
})

describe('groupsOf', () => {
  const folder = (path: string, soonest: number | null, files = 1) => ({ path, soonest_days: soonest, at_risk_files: files }) as Folder
  const summary = {
    deadlines: [{ days: 0, files: 2, bytes: 10 }, { days: 5, files: 3, bytes: 20 }, { days: 6, files: 1, bytes: 5 },
      { days: 40, files: 7, bytes: 70 }],
    folders: [folder('b', 6), folder('a', 3), folder('now', -1), folder('safe', null), folder('none', 4, 0)],
  } as Summary
  it('sums each deadline group and lists its folders soonest first', () => {
    expect(groupsOf(summary).map((g) => [g.title, g.files, g.bytes, g.folders.map((f) => f.path)])).toEqual([
      ['Could be deleted any day now', 2, 10, ['now']],
      ['Within a week', 4, 25, ['a', 'b']],
      ['Later', 7, 70, []],
    ])
  })
})
