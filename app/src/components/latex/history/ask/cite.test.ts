import { describe, expect, it } from 'vitest'

import { citeLabel, parseCites, plainCites } from './cite'

describe('cites', () => {
  it('cuts an answer into text and cites', () => {
    expect(parseCites('See [[main.tex:12]] and [[page 3]].')).toEqual([
      { text: 'See ' },
      { at: 4, cite: { path: 'main.tex', line: 12, end: 12 } },
      { text: ' and ' },
      { at: 24, cite: { page: 3 } },
      { text: '.' },
    ])
    expect(parseCites('no cites')).toEqual([{ text: 'no cites' }])
  })
  it('reads ranges and p.', () => {
    expect(parseCites('[[ sections/a.tex:3-7 ]] [[p. 2]]').filter((p) => 'cite' in p).map((p) => 'cite' in p && p.cite))
      .toEqual([{ path: 'sections/a.tex', line: 3, end: 7 }, { page: 2 }])
  })
  it('labels', () => {
    expect(citeLabel({ page: 4 })).toBe('page 4')
    expect(citeLabel({ path: 'main.tex', line: 30, end: 30 }, 'main.tex')).toBe('line 30')
    expect(citeLabel({ path: 'main.tex', line: 30, end: 34 }, 'main.tex')).toBe('lines 30 to 34')
    expect(citeLabel({ path: 'sections/results.tex', line: 5, end: 5 })).toBe('results.tex line 5')
  })
  it('plain words for a note', () => {
    expect(plainCites('Fixed in [[sections/results.tex:5-9]], see [[page 2]]'))
      .toBe('Fixed in results.tex line 5, see page 2')
  })
})
