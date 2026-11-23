import { describe, expect, it, vi } from 'vitest'

vi.mock('../../rpc', () => ({ call: vi.fn() }))
vi.mock('./platform', () => ({ inTauri: true }))

import { unfinishedNote } from './unfinishedUpdate'

// 2026-11-23: the installer couldn't replace hpc-hub-backend.exe, Ignore was pressed, and quick fixes then failed
// with "a file it shouldn't: fix.json"
describe('unfinishedNote', () => {
  it('says so when the backend program is another version than the window', () => {
    const note = unfinishedNote({ version: '0.2.7-beta.62', build: '0.2.7-beta.61' })
    expect(note).toContain("didn't finish")
    expect(note).toContain('0.2.7-beta.61')
    expect(note).toContain('installer again')
  })
  it('says nothing for the same version, with a quick fix or not', () => {
    expect(unfinishedNote({ version: '0.2.7-beta.62', build: '0.2.7-beta.62' })).toBeNull()
    expect(unfinishedNote({ version: '0.2.7-beta.62', build: '0.2.7-beta.62', fix: 3 })).toBeNull()
  })
  it('says nothing when the backend does not tell (not frozen, or older)', () => {
    expect(unfinishedNote({ version: '0.2.7-beta.62', build: '' })).toBeNull()
    expect(unfinishedNote({ version: '0.2.7-beta.62' })).toBeNull()
  })
})
