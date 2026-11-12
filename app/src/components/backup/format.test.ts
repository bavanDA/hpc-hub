import { describe, expect, it } from 'vitest'

import { count, gb, gbOf, shortName, when } from './format'
import { helpFor } from './help'

const GB = 1024 ** 3

describe('gb', () => {
  it.each([[38.2 * GB, '38.2 GB'], [260 * GB, '260 GB'], [1660 * GB, '1.62 TB'], [5 * 1024 ** 2, '5 MB'], [1, '1 MB']])(
    '%d bytes read %s', (bytes, want) => expect(gb(bytes)).toBe(want))
  it('reads sizes already in GB', () => {
    expect(gbOf(12.34)).toBe('12.3 GB')
    expect(gbOf(2048)).toBe('2.00 TB')
  })
})

describe('words', () => {
  it('shortens cluster names', () => {
    expect(shortName('Wulver (NJIT)')).toBe('Wulver')
    expect(shortName('Bouchet')).toBe('Bouchet')
  })
  it('groups thousands', () => expect(count(12345)).toBe('12,345'))
  it.each([[null, ''], [0, 'any day now'], [-2, 'any day now'], [1, 'tomorrow']])('%s days is %s', (d, want) =>
    expect(when(d)).toBe(want))
  it('names the day further out', () => expect(when(5)).toMatch(/^in 5 days, on \w+day, \w{3} \d+$/))
  it('names the help desk', () => {
    expect(helpFor('help@example.edu')).toBe('help@example.edu')
    expect(helpFor('')).toBe("your cluster's help desk")
  })
})
