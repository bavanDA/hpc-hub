import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ago, basename, dirname, ext, rel, short } from './bits'

describe('paths', () => {
  it('basename ignores trailing slashes', () => {
    expect(basename('/home/jdoe/paper/main.tex')).toBe('main.tex')
    expect(basename('/home/jdoe/paper/')).toBe('paper')
    expect(basename('main.tex')).toBe('main.tex')
  })

  it('dirname falls back to the root', () => {
    expect(dirname('sections/results.tex')).toBe('sections')
    expect(dirname('/main.tex')).toBe('/')
    expect(dirname('main.tex')).toBe('/')
  })

  it('rel strips the project folder only when inside it', () => {
    expect(rel('/p', '/p/sections/a.tex')).toBe('sections/a.tex')
    expect(rel('/p', '/pp/a.tex')).toBe('/pp/a.tex')
  })

  it('short shows home as ~', () => {
    expect(short('/home/jdoe/papers/x')).toBe('~/papers/x')
    expect(short('/mmfs1/home/jdoe/x')).toBe('~/x')
    expect(short('/scratch/x')).toBe('/scratch/x')
  })

  it('ext is lower case and keeps dot files', () => {
    expect(ext('Fig.PNG')).toBe('.png')
    expect(ext('dir/.gitignore')).toBe('.gitignore')
    expect(ext('Makefile')).toBe('')
  })
})

describe('ago', () => {
  const now = new Date('2026-03-10T12:00:00Z').getTime()
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(now) })
  afterEach(() => { vi.useRealTimers() })
  const t = (secondsBack: number) => now / 1000 - secondsBack

  it('says nothing for no time', () => expect(ago(0)).toBe(''))
  it('counts minutes, hours and days', () => {
    expect(ago(t(10))).toBe('just now')
    expect(ago(t(60))).toBe('1 minute ago')
    expect(ago(t(5 * 60))).toBe('5 minutes ago')
    expect(ago(t(2 * 3600))).toBe('2 hours ago')
    expect(ago(t(86400))).toBe('1 day ago')
  })
  it('gives a date after a month', () => {
    expect(ago(new Date('2024-03-03T12:00:00Z').getTime() / 1000)).toBe('Mar 3, 2024')
  })
})
