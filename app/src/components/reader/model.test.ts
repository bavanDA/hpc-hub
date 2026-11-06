import { describe, expect, it } from 'vitest'

import { splitHits } from './hits'
import { parseLook, START } from './look'
import { citeText, headings, plain, refText, type Block } from './model'

const labels = { 'sec:a': { num: '2', kind: 'Section' }, 'eq:b': { num: '3', kind: 'Equation' } }

describe('refText', () => {
  it.each([
    ['sec:a', 'ref', '2'],
    ['eq:b', 'eq', '(3)'],
    ['sec:a', 'named', 'Section 2'],
    ['eq:b', 'named', 'Equation (3)'],
    ['nope', 'named', '??'],
    ['nope', 'eq', '(??)'],
  ] as const)('%s as %s is %s', (key, style, want) => expect(refText(key, style, labels)).toBe(want))
})

describe('citeText', () => {
  it('shows each label, ? for unknown keys', () => expect(citeText(['a', 'x'], { a: '1' })).toBe('[1, ?]'))
})

describe('plain', () => {
  it('keeps the words of nested inline content', () =>
    expect(plain([{ t: 'text', s: 'a ' }, { t: 'em', c: [{ t: 'text', s: 'b' }] }, { t: 'br' }, { t: 'math', tex: 'x' }]))
      .toBe('a b '))
})

describe('headings', () => {
  it('lists the headings with their place', () => {
    const blocks: Block[] = [{ t: 'p', c: [] }, { t: 'h', level: 1, num: '1', c: [] }, { t: 'code', s: '' }]
    expect(headings(blocks)).toEqual([{ b: blocks[1], i: 1 }])
  })
})

describe('splitHits', () => {
  it('cuts around matches, ignoring case', () => expect(splitHits('Ab ab AB', 'ab')).toEqual(['', 'Ab', ' ', 'ab', ' ', 'AB', '']))
  it('is the whole text without a query', () => expect(splitHits('abc', '')).toEqual(['abc']))
  it('is the whole text without a match', () => expect(splitHits('abc', 'x')).toEqual(['abc']))
})

describe('parseLook', () => {
  it('keeps valid settings', () => expect(parseLook('{"font":"inter","size":24}')).toMatchObject({ font: 'inter', size: 24 }))
  it('puts back invalid ones', () =>
    expect(parseLook('{"font":"comic","size":99,"bg":"pink"}')).toEqual(START))
  it('starts over on broken JSON', () => expect(parseLook('{')).toEqual(START))
})
