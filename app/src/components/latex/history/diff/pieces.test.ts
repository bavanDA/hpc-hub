import { describe, expect, it } from 'vitest'

import type { FileDiff, Move, Row } from '../../../../types/history'
import { anchorOf, movesOf, pieces } from './pieces'

const row = (k: Row['k'], o: number | null, n: number | null, t: string): Row => ({ k, o, n, t, m: [] })
const file = (rows: Row[], old = 10): FileDiff => ({ path: 'main.tex', old_path: '', status: 'M', binary: false,
  added: 1, removed: 1, hunks: [{ old, new: old, header: '', rows }] })

describe('diff pieces', () => {
  const rows = [row(' ', 10, 10, 'a'), row('-', 11, null, 'b'), row('+', null, 11, 'B'), row(' ', 12, 12, 'c')]

  it('a gap before the hunk, then rows paired side by side', () => {
    const p = pieces(file(rows), 'split', true, [], false)
    expect(p.map((x) => x.kind)).toEqual(['gap', 'row', 'row', 'row'])
    expect(p[0]).toEqual({ kind: 'gap', lines: 9 })
    const changed = p[2] as Extract<typeof p[number], { kind: 'row' }>
    expect(changed.left?.t).toBe('b')
    expect(changed.right?.t).toBe('B')
    expect(changed.blk).toEqual({ path: 'main.tex', line: 11, end: 11, anchor: 'main.tex#n11', diff: '-b\n+B' })
  })
  it('inline puts old and new on their own rows, and put back follows the block', () => {
    const p = pieces(file(rows), 'inline', true, [], true)
    expect(p.map((x) => x.kind)).toEqual(['gap', 'row', 'row', 'row', 'back', 'row'])
    expect(p[4]).toEqual({ kind: 'back', put: { path: 'main.tex', line: 11, expect: ['B'], lines: ['b'] } })
  })
  it('anchorOf: the line now, or the old line of a removed row', () => {
    expect(anchorOf('a.tex', { kind: 'row', right: row('+', null, 4, 'x') })).toBe('a.tex#n4')
    expect(anchorOf('a.tex', { kind: 'row', left: row('-', 7, null, 'x') })).toBe('a.tex#o7')
    expect(anchorOf('a.tex', undefined)).toBe('a.tex#top')
  })
  it('movesOf counts lines moved in and out of a file', () => {
    const m = (from: string, to: string, lines: number): Move => ({ id: 1, lines, changes: 0,
      from: { path: from, line: 1, end: lines }, to: { path: to, line: 1, end: lines } })
    expect(movesOf([m('a.tex', 'b.tex', 3), m('b.tex', 'a.tex', 2)], 'a.tex')).toBe('2 moved in · 3 moved out')
    expect(movesOf([], 'a.tex')).toBe('')
  })
})
