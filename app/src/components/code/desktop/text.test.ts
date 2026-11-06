import { describe, expect, it } from 'vitest'

import { andList, isLog, lineCount, linesLabel, parentDir, terminalCount } from './text'

describe('isLog', () => {
  it.each([
    ['run.out', true], ['slurm-12.ERR', true], ['train.log', true], ['run.py', false], ['log.txt', false],
  ])('%s is %s', (path, want) => expect(isLog(path)).toBe(want))
})

describe('lineCount', () => {
  it('counts lines, a trailing newline starts one more', () => {
    expect(lineCount('')).toBe(1)
    expect(lineCount('a\nb')).toBe(2)
    expect(lineCount('a\nb\n')).toBe(3)
  })
})

describe('andList', () => {
  it.each([
    [['a.py'], 'a.py'],
    [['a.py', 'b.py'], 'a.py and b.py'],
    [['a.py', 'b.py', 'c.py'], 'a.py, b.py and c.py'],
  ])('%j', (names, want) => expect(andList(names)).toBe(want))
})

describe('linesLabel', () => {
  it('names one line or a range', () => {
    expect(linesLabel(4, 4)).toBe('4')
    expect(linesLabel(4, 9)).toBe('4 to 9')
  })
})

describe('parentDir', () => {
  it.each([
    ['/home/jdoe/p/a.py', '/home/jdoe/p'],
    ['/a.py', '/'],
    ['/', '/'],
  ])('%s', (path, want) => expect(parentDir(path)).toBe(want))
})

describe('terminalCount', () => {
  it.each([[0, 'Terminal'], [1, '1 terminal'], [3, '3 terminals']])('%d', (n, want) =>
    expect(terminalCount(n)).toBe(want))
})
