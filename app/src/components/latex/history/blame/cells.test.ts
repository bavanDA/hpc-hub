import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BlameCommit } from '../../../../types/history'
import { cells } from './cells'

const NOW = new Date('2026-11-06T12:00:00').getTime() / 1000
const commit = (hash: string, author: string, ago: number, uncommitted = false): BlameCommit =>
  ({ hash, author, time: NOW - ago, summary: '', path: 'main.tex', previous: null, uncommitted })

describe('blame cells', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW * 1000) })
  afterEach(() => { vi.useRealTimers() })

  it('one cell per line, the name on the first line of a run, newer is fresher', () => {
    const b = { commits: { a: commit('a', 'jdoe', 2 * 3600), b: commit('b', 'mygroup', 3 * 86400),
      w: commit('w', '', 0, true) }, lines: [['a', 1], ['a', 2], ['b', 3], ['w', 4], ['x', 5]] as [string, number][] }
    expect(cells(b)).toEqual([
      { first: true, who: 'jdoe', age: '2h', uncommitted: false, fresh: 1 },
      { first: false, who: 'jdoe', age: '2h', uncommitted: false, fresh: 1 },
      { first: true, who: 'mygroup', age: '3d', uncommitted: false, fresh: 0 },
      { first: true, who: 'Not committed', age: 'now', uncommitted: true, fresh: 1 },
      null,
    ])
  })
  it('short ages', () => {
    const one = (ago: number) => cells({ commits: { a: commit('a', 'jdoe', ago) }, lines: [['a', 1]] })[0]?.age
    expect(one(30)).toBe('1m')
    expect(one(20 * 60)).toBe('20m')
    expect(one(30 * 86400)).toBe('Oct 7')
  })
})
