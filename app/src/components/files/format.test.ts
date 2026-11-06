import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Entry } from '../../types/files'
import { basename, ext, isArchive, isText, join, kind, parent, size, sorted, when } from './format'

const file = (name: string, over: Partial<Entry> = {}): Entry => ({ name, kind: 'f', size: 0, mtime: 0, ...over })
const dir = (name: string, over: Partial<Entry> = {}): Entry => file(name, { kind: 'd', ...over })

describe('size', () => {
  it.each([
    [0, '0 bytes'], [1, '1 byte'], [999, '999 bytes'], [1000, '1 kB'], [1234, '1.2 kB'], [912_000_000, '912 MB'],
    [2_000_000_000, '2 GB'], [5e15, '5 PB'],
  ])('%d is %s', (n, want) => expect(size(n)).toBe(want))
})

describe('ext', () => {
  it.each([['a.PY', '.py'], ['data.tar.gz', '.tar.gz'], ['.bashrc', ''], ['Makefile', ''], ['x.tar.xz', '.tar.xz']])(
    '%s has %s', (name, want) => expect(ext(name)).toBe(want))
})

describe('kind', () => {
  it.each([
    [dir('src'), 'folder'], [file('paper.pdf'), 'pdf'], [file('plot.PNG'), 'image'], [file('a.tgz'), 'archive'],
    [file('w.h5'), 'data'], [file('train.py'), 'code'], [file('notes.txt'), 'text'], [file('blob.bin'), 'other'],
  ])('%o is %s', (e, want) => expect(kind(e)).toBe(want))
  it('reads text and archives, never folders', () => {
    expect(isText(file('README'))).toBe(true)
    expect(isText(dir('notes.txt'))).toBe(false)
    expect(isArchive(file('x.zip'))).toBe(true)
  })
})

describe('when', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 10, 6, 15, 0)) })
  afterEach(() => vi.useRealTimers())
  const at = (...d: [number, number, number, number, number]) => new Date(...d).getTime() / 1000
  it('shows the time today', () => expect(when(at(2026, 10, 6, 9, 5))).toBe('09:05'))
  it('shows the day this year', () => expect(when(at(2026, 2, 3, 14, 5))).toBe('Mar 3 14:05'))
  it('shows the year before', () => expect(when(at(2023, 2, 3, 14, 5))).toBe('Mar 3 2023'))
})

describe('sorted', () => {
  const list = [file('b', { size: 5, mtime: 1 }), dir('z'), file('A', { size: 9, mtime: 3 }), dir('c')]
  it('puts folders first, then by name', () =>
    expect(sorted(list, { key: 'name', desc: false }).map((e) => e.name)).toEqual(['c', 'z', 'A', 'b']))
  it('keeps folders first when reversed', () =>
    expect(sorted(list, { key: 'size', desc: true }).map((e) => e.name)).toEqual(['z', 'c', 'A', 'b']))
  it('sorts by date', () =>
    expect(sorted(list, { key: 'mtime', desc: false }).map((e) => e.name).slice(2)).toEqual(['b', 'A']))
})

describe('paths', () => {
  it('joins', () => {
    expect(join('/home/jdoe', 'a')).toBe('/home/jdoe/a')
    expect(join('/', 'a')).toBe('/a')
  })
  it.each([['/home/jdoe/a', '/home/jdoe'], ['/home/', '/'], ['/a', '/'], ['/', '/']])('parent of %s is %s', (p, want) =>
    expect(parent(p)).toBe(want))
  it('names the last part', () => {
    expect(basename('/home/jdoe/thesis/')).toBe('thesis')
    expect(basename('/')).toBe('/')
  })
})
