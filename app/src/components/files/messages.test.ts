import { describe, expect, it } from 'vitest'

import type { Transfer } from '../../types/files'
import { finishedMessage, startedMessage } from './messages'

const transfer = (error = ''): Transfer => ({ id: '1', title: 'data.csv: alpha to beta', how: 'laptop', done: 1,
  total: 1, status: '', finished: true, error })

describe('finishedMessage', () => {
  it('names the copied file before the colon', () => expect(finishedMessage(transfer())).toBe('Copied data.csv'))
  it('says a cancel plainly', () => expect(finishedMessage(transfer('Cancelled'))).toBe('Copy cancelled'))
  it('passes other errors on', () => expect(finishedMessage(transfer('disk full'))).toBe('Copy failed: disk full'))
})

describe('startedMessage', () => {
  it('names the file on the same cluster', () => expect(startedMessage(true, 'laptop', 'a.py')).toBe('Copying a.py…'))
  it('points to progress between clusters', () => {
    expect(startedMessage(false, 'globus', 'a.py')).toBe('Sent to Globus. Progress is below')
    expect(startedMessage(false, 'laptop', 'a.py')).toBe('Copying. Progress is below')
  })
})
