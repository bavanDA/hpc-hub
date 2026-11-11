import { afterEach, describe, expect, it } from 'vitest'

import { failureFor, forgetAll, noteFailure } from './recent'
import { reportText } from './text'

afterEach(forgetAll)

describe('failureFor', () => {
  it('finds the failed call a toast shows', () => {
    noteFailure('files.list', 'Traceback line\nconnection closed by <host>', 7)
    expect(failureFor('Could not list files: connection closed by <host>')?.ref).toBe(7)
  })
  it('finds it when the toast shows the whole message', () => {
    noteFailure('jobs.cancel', 'Job 12 is not yours', 3)
    expect(failureFor('Job 12 is not yours')?.method).toBe('jobs.cancel')
  })
  it('takes the latest, and nothing older than half a minute', () => {
    noteFailure('a', 'timed out', 1)
    noteFailure('b', 'timed out', 2)
    expect(failureFor('timed out')?.ref).toBe(2)
    expect(failureFor('timed out', Date.now() + 31_000)).toBeUndefined()
  })
  it('leaves other toasts alone', () => {
    noteFailure('a', 'x', 1)
    expect(failureFor('Link copied')).toBeUndefined()
  })
})

describe('reportText', () => {
  const p = { kind: 'error' as const, error: 'Could not list files', log: '09:14:02  Signed in', page: 'files',
    app: '0.1.0', platform: 'linux', os: 'Fedora Linux 44' }
  it('shows every field that will be sent, in order', () => {
    expect(reportText(p, ' It broke ', 'me@example.com')).toBe('HPC Hub 0.1.0 on Linux, Fedora Linux 44'
      + '\nPage: files\n\nError\nCould not list files\n\nYour note\nIt broke\n\nYour email\nme@example.com'
      + '\n\nRecent log\n09:14:02  Signed in')
  })
  it('leaves out what is empty', () => {
    expect(reportText({ ...p, error: '', log: '', page: '' }, '', '')).toBe('HPC Hub 0.1.0 on Linux, Fedora Linux 44')
  })
})
