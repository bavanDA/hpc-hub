import { describe, expect, it } from 'vitest'

import { messageFor } from './agentMessage'

const file = { cluster: 'c', path: '/home/jdoe/a.py' }

describe('messageFor', () => {
  it('asks about the whole file', () =>
    expect(messageFor(file, 'explain', '')).toBe('In /home/jdoe/a.py: Explain what this code does.'))

  it('names the lines and adds the question', () =>
    expect(messageFor({ ...file, from_line: 3, to_line: 9 }, 'test', ' with pytest '))
      .toBe('In /home/jdoe/a.py lines 3 to 9: Write a test for this code. with pytest'))

  it('puts the error last', () =>
    expect(messageFor({ ...file, from_line: 4 }, 'fix', '', ' boom \n'))
      .toBe('In /home/jdoe/a.py lines 4 to 4: Fix this error.\n\nThe error:\nboom'))

  it('sends your own words as they are', () => expect(messageFor(file, 'free', 'Why?')).toBe('In /home/jdoe/a.py: Why?'))
})
