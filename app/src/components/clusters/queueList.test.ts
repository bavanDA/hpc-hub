import { describe, expect, it } from 'vitest'

import { pickNote } from './queuePick'
import { parseQueues, queueCount, queuesText } from './queueList'

describe('parseQueues', () => {
  it('reads queue and priority pairs', () =>
    expect(parseQueues(' general:low , debug ,')).toEqual([
      { queue: 'general', billing: 'low' }, { queue: 'debug', billing: '' }]))
  it('round trips through queuesText', () =>
    expect(queuesText(parseQueues('general:low,debug'))).toBe('general:low,debug'))
})

describe('queuesText', () => {
  it('drops rows without a queue', () =>
    expect(queuesText([{ queue: ' ', billing: 'low' }, { queue: 'gpu ', billing: ' ' }])).toBe('gpu'))
})

describe('queueCount', () => {
  it.each([[undefined, 'The one you pick'], ['general', '1 queue'], ['a:b,c', '2 queues']])(
    '%s -> %s', (text, want) => expect(queueCount(text)).toBe(want))
})

describe('pickNote', () => {
  it('explains fastest', () => expect(pickNote('fastest')).toMatch(/^Takes the queue that starts soonest/))
  it('counts a short wait in seconds', () => expect(pickNote('cheapest', 90)).toContain('more than 90 seconds'))
  it('counts a long wait in minutes', () => expect(pickNote(undefined, 600)).toContain('more than 10 minutes'))
})
