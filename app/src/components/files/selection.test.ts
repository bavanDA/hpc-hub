import { describe, expect, it } from 'vitest'

import { howOf, pick } from './selection'

const names = ['a', 'b', 'c', 'd']
const set = (...n: string[]) => new Set(n)

describe('pick', () => {
  it('picks one on a click', () => expect(pick(names, set('a', 'b'), 'a', 'c', 'one')).toEqual(set('c')))
  it('adds or drops one with Ctrl', () => {
    expect(pick(names, set('a'), 'a', 'c', 'toggle')).toEqual(set('a', 'c'))
    expect(pick(names, set('a', 'c'), 'c', 'a', 'toggle')).toEqual(set('c'))
  })
  it('picks the run from the anchor with Shift, either way', () => {
    expect(pick(names, set('b'), 'b', 'd', 'range')).toEqual(set('b', 'c', 'd'))
    expect(pick(names, set('c'), 'c', 'a', 'range')).toEqual(set('a', 'b', 'c'))
  })
  it('picks one with Shift when there is no anchor', () =>
    expect(pick(names, set(), null, 'b', 'range')).toEqual(set('b')))
})

describe('howOf', () => {
  it.each([[{ ctrlKey: true, metaKey: false, shiftKey: false }, 'toggle'],
    [{ ctrlKey: false, metaKey: true, shiftKey: false }, 'toggle'],
    [{ ctrlKey: true, metaKey: false, shiftKey: true }, 'range'],
    [{ ctrlKey: false, metaKey: false, shiftKey: false }, 'one']] as const)('%o is %s', (ev, how) =>
    expect(howOf(ev)).toBe(how))
})
