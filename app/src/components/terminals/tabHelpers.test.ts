import { describe, expect, it } from 'vitest'

import type { Link } from '../../types/terminals'
import { linkBanner, mayHaveLinks } from './linkBanner'
import { screenText } from './screenText'
import { nextCurrent, tabKey } from './tabKey'

describe('tabKey', () => {
  it('joins cluster and session', () => expect(tabKey('wulver', 'main')).toBe('wulver/main'))
})

describe('nextCurrent', () => {
  const keys = ['a', 'b', 'c']
  it('keeps the shown tab when another one closes', () => expect(nextCurrent(keys, 'a', 'c')).toBe('c'))
  it('shows the tab that takes the closed one\'s place', () => expect(nextCurrent(keys, 'b', 'b')).toBe('c'))
  it('shows the new last tab when the last one closes', () => expect(nextCurrent(keys, 'c', 'c')).toBe('b'))
  it('shows nothing when the only tab closes', () => expect(nextCurrent(['a'], 'a', 'a')).toBeNull())
  it('keeps nothing shown', () => expect(nextCurrent(keys, 'a', null)).toBeNull())
})

const buffer = (rows: [string, boolean][]) => ({
  length: rows.length,
  getLine: (y: number) => rows[y] && { isWrapped: rows[y][1], translateToString: () => rows[y][0] },
})

describe('screenText', () => {
  it('joins wrapped lines back', () =>
    expect(screenText(buffer([['https://exa', false], ['mple.org', true], ['next', false]])))
      .toBe('https://example.org\nnext'))
  it('reads only the last lines', () =>
    expect(screenText(buffer([['one', false], ['two', false], ['three', false]]), 2)).toBe('two\nthree'))
  it('keeps a wrapped first line', () => expect(screenText(buffer([['tail', true]]))).toBe('tail'))
})

const link = (over: Partial<Link>): Link => ({ kind: 'tunnel', url: 'https://x', code: '', host: '', port: 0, ...over })

describe('mayHaveLinks', () => {
  it.each([['see https://example.org', true], ['Pairing code: 1234', true], ['$ ls', false]])(
    '%s: %s', (text, want) => expect(mayHaveLinks(text)).toBe(want))
})

describe('linkBanner', () => {
  it('names the tunnel', () => expect(linkBanner(link({ tunnel: 'gpu1' }), false))
    .toEqual({ text: 'VS Code is ready (tunnel gpu1)', button: 'Open in browser' }))
  it('says when the sign-in code was copied', () => {
    expect(linkBanner(link({ kind: 'device-login', code: 'AB-12' }), true)?.text).toBe('Sign in with code AB-12 (copied)')
    expect(linkBanner(link({ kind: 'device-login', code: 'AB-12' }), false)?.text).toBe('Sign in with code AB-12')
  })
  it('copies a pairing code', () => expect(linkBanner(link({ kind: 'pair', code: '42' }), false))
    .toMatchObject({ button: 'Copy code', copy: true }))
  it('opens remote control', () => expect(linkBanner(link({ kind: 'remote' }), false)?.button).toBe('Open'))
  it('shows nothing for a local web page', () => expect(linkBanner(link({ kind: 'local-web' }), false)).toBeNull())
})
