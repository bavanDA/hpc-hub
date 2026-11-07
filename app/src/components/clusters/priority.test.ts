import { describe, expect, it } from 'vitest'

import { groupName, priorityName, queueText } from './priority'

describe('priorityName', () => {
  it.each([
    [undefined, 'Default'],
    ['', 'Default'],
    ['low', 'Low'],
    ['high_mygroup', 'High (mygroup)'],
    ['gpu_debug', 'Gpu debug'],
  ])('%s -> %s', (qos, want) => expect(priorityName(qos)).toBe(want))
})

describe('groupName', () => {
  it('marks the default group', () => expect(groupName('mygroup', 'mygroup')).toBe('mygroup (default)'))
  it('falls back to the default group', () => expect(groupName('', 'mygroup')).toBe('mygroup (default)'))
  it('says Default with nothing known', () => expect(groupName()).toBe('Default'))
  it('keeps another group as it is', () => expect(groupName('other', 'mygroup')).toBe('other'))
})

describe('queueText', () => {
  it('joins the queue and its priority', () => expect(queueText('general', 'low')).toBe('general, Low'))
  it('skips a priority named like its queue', () => expect(queueText('debug', 'debug')).toBe('debug'))
  it('says Default for neither', () => expect(queueText()).toBe('Default'))
})
