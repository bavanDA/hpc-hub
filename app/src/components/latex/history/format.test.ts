import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fileName, group, initials, lastLine, plural, shortHash, when } from './format'

const at = (s: string) => new Date(s).getTime() / 1000

describe('small words', () => {
  it('plural', () => {
    expect(plural(1, 'file')).toBe('1 file')
    expect(plural(3, 'file')).toBe('3 files')
    expect(plural(2, 'person', 'people')).toBe('2 people')
  })
  it('lastLine, shortHash, fileName', () => {
    expect(lastLine('fatal: one\nhint: two\n')).toBe('hint: two')
    expect(shortHash('a91c3e2ffee')).toBe('a91c3e2')
    expect(fileName('sections/results.tex')).toBe('results.tex')
  })
  it('initials', () => {
    expect(initials('jdoe')).toBe('JD')
    expect(initials('mygroup')).toBe('MG')
    expect(initials('Jane Doe')).toBe('JD')
    expect(initials('')).toBe('?')
  })
})

describe('times', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T15:00:00')) })
  afterEach(() => { vi.useRealTimers() })

  it('when', () => {
    expect(when(at('2026-11-06T14:59:30'))).toBe('just now')
    expect(when(at('2026-11-06T14:58:00'))).toBe('2 min ago')
    expect(when(at('2026-11-06T13:00:00'))).toBe('2 hours ago')
    expect(when(at('2026-11-06T08:10:00'))).toBe('08:10')
    expect(when(at('2026-11-06T08:10:00'), true)).toBe('today 08:10')
    expect(when(at('2026-11-05T09:00:00'))).toBe('Yesterday')
    expect(when(at('2026-11-05T09:00:00'), true)).toBe('Yesterday, 09:00')
    expect(when(at('2026-10-31T09:00:00'))).toBe('Oct 31')
    expect(when(at('2024-10-31T09:00:00'))).toBe('Oct 31 2024')
  })
  it('group', () => {
    expect(group(at('2026-11-06T01:00:00'))).toBe('Today')
    expect(group(at('2026-11-05T01:00:00'))).toBe('Yesterday')
    expect(group(at('2026-10-02T01:00:00'))).toBe('October')
    expect(group(at('2025-03-02T01:00:00'))).toBe('March 2025')
  })
})
