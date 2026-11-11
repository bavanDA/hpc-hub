import { describe, expect, it, vi } from 'vitest'

vi.mock('../../rpc', () => ({ call: vi.fn() }))

import { countInside } from './live'

describe('countInside', () => {
  const terminals = ['/mmfs1/scratch/mygroup/jdoe/thesis', '/mmfs1/scratch/mygroup/jdoe/thesis/src', '/home/jdoe']
  it('finds a terminal through the folder with links followed', () =>
    expect(countInside(terminals, ['/scratch/mygroup/jdoe/thesis', '/mmfs1/scratch/mygroup/jdoe/thesis'])).toBe(2))
  it('misses it without the real folder', () => expect(countInside(terminals, ['/scratch/mygroup/jdoe/thesis'])).toBe(0))
  it('counts each terminal once', () => expect(countInside(['/a/b'], ['/a/b', '/a/b/'])).toBe(1))
  it('does not count a folder with a similar name', () => expect(countInside(['/a/bc'], ['/a/b'])).toBe(0))
})
