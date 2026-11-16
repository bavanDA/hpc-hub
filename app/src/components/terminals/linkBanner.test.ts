import { describe, expect, it } from 'vitest'

import { betterPagePath } from './linkBanner'

describe('betterPagePath', () => {
  it('takes a full path over a relative one, whichever came first', () => {
    expect(betterPagePath('docs/r.html', '/scratch/jdoe/proj/docs/r.html')).toBe('/scratch/jdoe/proj/docs/r.html')
    expect(betterPagePath('/scratch/jdoe/proj/docs/r.html', 'docs/r.html')).toBe('/scratch/jdoe/proj/docs/r.html')
    expect(betterPagePath('r.html', '~/proj/r.html')).toBe('~/proj/r.html')
  })
  it('then the one that says more', () => {
    expect(betterPagePath('r.html', 'docs/r.html')).toBe('docs/r.html')
    expect(betterPagePath('docs/r.html', 'r.html')).toBe('docs/r.html')
  })
})
