import { describe, expect, it } from 'vitest'

import { firstStartOn, indexWords, nearestWord, wordAround, wordAtTime, type Timing } from './words'

const list = [
  [1, 1, 10, 10, 30, 20],
  [2, 1, 40, 10, 60, 20],
  [3, 2, 10, 10, 30, 20],
]
const { words, byPage } = indexWords(list)
const times: Timing[] = [[1, 0, 0.3], [2, 0.3, 0.6], [3, 0.6, 0.9]]

describe('indexWords', () => {
  it('keeps each box by id', () => expect(words.get(2)).toEqual([1, 40, 10, 60, 20]))
  it('lists the ids on each page', () => {
    expect(byPage.get(1)).toEqual([1, 2])
    expect(byPage.get(2)).toEqual([3])
  })
})

describe('nearestWord', () => {
  it('finds the word under the point', () => expect(nearestWord([1, 2], words, 45, 15)).toBe(2))
  it('finds a word a little to the side', () => expect(nearestWord([1, 2], words, 34, 15)).toBe(1))
  it('is null far from every word', () => expect(nearestWord([1, 2], words, 200, 200)).toBeNull())
  it('weighs rows more than columns', () => expect(nearestWord([1], words, 20, 30)).toBeNull())
})

describe('wordAtTime', () => {
  it.each([
    [0, 1],
    [0.45, 2],
    [5, 3],
  ])('at %d s it is word %d', (t, id) => expect(wordAtTime(times, t)).toBe(id))
  it('is null before the first word', () => expect(wordAtTime([[1, 1, 2]], 0.5)).toBeNull())
  it('is null without timings', () => expect(wordAtTime([], 1)).toBeNull())
})

describe('firstStartOn', () => {
  it('starts at the first word of the page', () => expect(firstStartOn(times, words, 2)).toBe(0.6))
  it('starts at the beginning past the last page', () => expect(firstStartOn(times, words, 9)).toBe(0))
})

describe('wordAround', () => {
  it('takes the word the offset is in', () => expect(wordAround('the quick fox', 6)).toBe('quick'))
  it('keeps inner apostrophes and hyphens', () => expect(wordAround("a well-known don't", 4)).toBe('well-known'))
  it('drops quotes at the ends', () => expect(wordAround("say 'hello' now", 6)).toBe('hello'))
  it('is empty between words', () => expect(wordAround('a , b', 2)).toBe(''))
})
