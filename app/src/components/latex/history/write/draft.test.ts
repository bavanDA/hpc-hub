import { describe, expect, it } from 'vitest'

import { commitMessage, editedSince } from './draft'

describe('draft', () => {
  it('commitMessage: summary, a blank line, then the why', () => {
    expect(commitMessage({ subject: ' Fix the weight ', body: '' })).toBe('Fix the weight')
    expect(commitMessage({ subject: 'Fix', body: ' It was 0.01.\n' })).toBe('Fix\n\nIt was 0.01.')
  })
  it('editedSince: files that changed after the agent read them', () => {
    const c = (path: string, added: number) => ({ path, added, removed: 0, new: false })
    expect(editedSince(undefined, [c('a.tex', 1)])).toEqual([])
    expect(editedSince([c('a.tex', 1), c('b.tex', 2)], [c('a.tex', 1), c('b.tex', 3), c('c.tex', 1)]))
      .toEqual(['b.tex', 'c.tex'])
  })
})
