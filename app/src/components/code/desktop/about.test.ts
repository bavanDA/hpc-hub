import { describe, expect, it } from 'vitest'

import type { TmuxSession } from '../../../types/terminals'
import { about } from './about'

describe('about', () => {
  const now = 1_700_000_000_000
  const session = (s: Partial<TmuxSession>) => ({ name: 'a', kind: 'tmux', agent: '', command: 'python', path: '',
    node: '', created: 0, ...s }) as TmuxSession
  it('says where it runs, in which folder and for how long', () => {
    const s = session({ node: 'n0042', path: '/home/jdoe/p/src', created: now / 1000 - 3 * 3600 })
    expect(about(s, '/home/jdoe/p', '/home/jdoe', now)).toBe('python · n0042 · src · 3 h')
  })
  it('names the login node and a path outside the folder', () => {
    const s = session({ path: '/home/jdoe/other', created: now / 1000 - 120 })
    expect(about(s, '/home/jdoe/p', '/home/jdoe', now)).toBe('python · login node · ~/other · 2 min')
  })
  it('counts days after two days', () => {
    const s = session({ created: now / 1000 - 3 * 86400 })
    expect(about(s, '/home/jdoe/p', '/home/jdoe', now)).toBe('python · login node · 3 days')
  })
})
