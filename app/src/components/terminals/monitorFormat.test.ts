import { describe, expect, it } from 'vitest'

import { duration, level, rate, size, usedOf } from './monitorFormat'

describe('size', () => {
  it('counts in thousands with one decimal below 100', () => {
    expect(size(999)).toBe('999 B')
    expect(size(1500)).toBe('1.5 kB')
    expect(size(150_000)).toBe('150 kB')
    expect(size(8e9)).toBe('8.0 GB')
  })

  it('stops at TB', () => {
    expect(size(5e15)).toBe('5000 TB')
  })
})

describe('rate', () => {
  it('waits for the first number', () => {
    expect(rate(null)).toBe('...')
    expect(rate(2500)).toBe('2.5 kB/s')
  })
})

describe('duration', () => {
  it('shows the two biggest units', () => {
    expect(duration(90)).toBe('1 min')
    expect(duration(3700)).toBe('1 h 1 min')
    expect(duration(90_000)).toBe('1 d 1 h')
  })
})

describe('level', () => {
  it('warns from 80 percent and is high from 90', () => {
    expect(level(null)).toBe('')
    expect(level(79)).toBe('')
    expect(level(85)).toBe('warn')
    expect(level(95)).toBe('high')
  })
})

describe('usedOf', () => {
  it('names the unit once when both share it', () => {
    expect(usedOf(1.5e9, 8e9)).toBe('1.5 / 8.0 GB')
    expect(usedOf(500e6, 8e9)).toBe('500 MB / 8.0 GB')
  })
})
