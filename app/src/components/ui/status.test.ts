import { describe, expect, it } from 'vitest'

import { statusKind } from './status'

describe('statusKind', () => {
  it('reads session states', () => {
    expect(statusKind('Connected')).toBe('success')
    expect(statusKind('Approve Duo on your phone')).toBe('warning')
    expect(statusKind('Connecting')).toBe('info')
    expect(statusKind('Sign-in failed')).toBe('danger')
  })

  it('reads Slurm job states', () => {
    expect(statusKind('RUNNING')).toBe('success')
    expect(statusKind('PENDING')).toBe('warning')
    expect(statusKind('OUT_OF_MEMORY')).toBe('danger')
    expect(statusKind('COMPLETING')).toBe('info')
  })

  it('falls back to neutral', () => {
    expect(statusKind('Not connected')).toBe('neutral')
    expect(statusKind('')).toBe('neutral')
  })
})
