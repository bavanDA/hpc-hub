import { describe, expect, it } from 'vitest'

import type { GitState } from '../../../../types/history'
import { branchStatus } from './status'

const state = (s: Partial<GitState>) => ({ upstream: 'origin/main', remotes: [{}], ahead: 0, behind: 0, ...s }) as GitState

describe('branchStatus', () => {
  it('says where the branch is against origin', () => {
    expect(branchStatus(state({ upstream: '', remotes: [] }))).toBe('No remote')
    expect(branchStatus(state({ upstream: '' }))).toBe('Not on origin yet')
    expect(branchStatus(state({ ahead: 2, behind: 1 }))).toBe('2 to push, 1 new')
    expect(branchStatus(state({ ahead: 2 }))).toBe('2 to push')
    expect(branchStatus(state({ behind: 3 }))).toBe('3 new')
    expect(branchStatus(state({}))).toBe('Up to date')
  })
})
