import { describe, expect, it, vi } from 'vitest'

vi.mock('../../rpc', () => ({ call: vi.fn() }))
vi.mock('./platform', () => ({ inTauri: false }))

import { passwordProblem } from './BackupFileDialog'

describe('the backup file password', () => {
  it('needs 8 characters and the same twice', () => {
    expect(passwordProblem('short', '')).toBe('At least 8 characters')
    expect(passwordProblem('long enough', 'long enougH')).toBe("The two passwords don't match")
    expect(passwordProblem('long enough', 'long enough')).toBe('')
    expect(passwordProblem('long enough', '')).toBe('')  // not typed again yet: no complaint
  })
})
