import { describe, expect, it } from 'vitest'

import { linksAt } from './wrappedLinks'

const COLS = 40
/** A screen of rows, each padded to COLS cells as the terminal keeps them. */
const screen = (...rows: string[]) => (i: number) => i < rows.length ? rows[i].padEnd(COLS, ' ') : undefined
/** A long link cut into full rows, the way Claude Code draws its login link. */
const cut = (s: string) => s.match(new RegExp(`.{1,${COLS}}`, 'g'))!

// 2026-11-18: Claude's login link (5 rows on a 100-column terminal) was not a link in the terminal (owner's report)
const LOGIN = 'https://claude.com/cai/oauth/authorize?code=true&client_id=00000000-0000-0000-0000-000000000000' +
  '&response_type=code&redirect_uri=https%3A%2F%2Fplatform.example.com%2Fcallback&scope=user%3Ainference' +
  '&state=AbCdEfGh123'

describe('links over several rows', () => {
  const rows = ['Browser didn\'t open? Use this link:', '', ...cut(LOGIN), '', 'Paste code here if prompted >']
  const at = screen(...rows)

  it('the whole login link is one link, on every row it covers', () => {
    for (let y = 2; y < 2 + cut(LOGIN).length; y++) {
      const found = linksAt(at, COLS, y)
      expect(found).toHaveLength(1)
      expect(found[0].url).toBe(LOGIN)
      expect(found[0].start).toEqual({ x: 1, y: 2 })
      expect(found[0].end.y).toBe(2 + cut(LOGIN).length - 1)
    }
  })

  it('ends where the link ends on its last row', () => {
    const last = cut(LOGIN).at(-1)!
    expect(linksAt(at, COLS, 2)[0].end.x).toBe(last.length)
  })

  it('rows around it are not part of it', () => {
    expect(linksAt(at, COLS, 0)).toEqual([])
    expect(linksAt(at, COLS, rows.length - 1)).toEqual([])
  })
})

describe('ordinary links', () => {
  it('a link on one row', () => {
    const found = linksAt(screen('see https://example.edu/docs for more'), COLS, 0)
    expect(found).toEqual([{ url: 'https://example.edu/docs', start: { x: 5, y: 0 }, end: { x: 28, y: 0 } }])
  })

  it('sentence punctuation after a link stays out of it', () => {
    expect(linksAt(screen('Open https://example.edu/a.'), COLS, 0)[0].url).toBe('https://example.edu/a')
    expect(linksAt(screen('(https://example.edu/a)'), COLS, 0)[0].url).toBe('https://example.edu/a')
  })

  it('two links on a row are two links', () => {
    expect(linksAt(screen('http://a.example b https://b.example'), COLS, 0).map((f) => f.url))
      .toEqual(['http://a.example', 'https://b.example'])
  })

  it('a full row followed by text after a space is not joined', () => {
    const first = 'https://example.edu/' + 'x'.repeat(COLS - 20)
    const found = linksAt(screen(first, '  indented next line'), COLS, 0)
    expect(found[0].url).toBe(first)
  })

  it('a link that starts the next row is a new link, not a continuation', () => {
    const first = 'https://one.example/' + 'a'.repeat(COLS - 20)
    const found = linksAt(screen(first, 'https://two.example/b'), COLS, 1)
    expect(found.map((f) => f.url)).toEqual(['https://two.example/b'])
  })

  it('no link, no answer; past the end, no answer', () => {
    expect(linksAt(screen('just text'), COLS, 0)).toEqual([])
    expect(linksAt(screen('just text'), COLS, 5)).toEqual([])
  })
})
