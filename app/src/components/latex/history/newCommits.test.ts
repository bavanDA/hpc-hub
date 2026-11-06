import { describe, expect, it } from 'vitest'

import type { HCommit } from '../../../types/history'
import { newCommits } from './newCommits'

const c = (hash: string, author: string, subject: string) => ({ hash, author, subject }) as HCommit

describe('newCommits', () => {
  it('keeps hashes that were not there before', () => {
    const before = [c('a1', 'jdoe', 'Intro')]
    expect(newCommits(before, [c('b2', 'asmith', 'Results'), c('a1', 'jdoe', 'Intro')])).toEqual(new Set(['b2']))
  })

  it('skips your own commits put on top again under a new hash', () => {
    const before = [c('a1', 'jdoe', 'Intro')]
    expect(newCommits(before, [c('a9', 'jdoe', 'Intro'), c('b2', 'asmith', 'Intro')])).toEqual(new Set(['b2']))
  })

  it('is empty when nothing came in', () => {
    expect(newCommits([], []).size).toBe(0)
  })
})
