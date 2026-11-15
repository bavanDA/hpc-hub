import { afterEach, describe, expect, it, vi } from 'vitest'

import { caughtLines } from '../report/recent'
import { readClipboard } from './clipboard'

vi.mock('../../rpc', () => ({ call: vi.fn() }))  // the backend needs a window
vi.mock('./platform', () => ({ inTauri: false }))

describe('readClipboard', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('answers what the clipboard holds', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: async () => 'ls -la' } })
    expect(await readClipboard()).toBe('ls -la')
  })
  it('says why it could not, for a bug report', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: async () => { throw new Error('NotAllowedError') } } })
    expect(await readClipboard()).toBeNull()
    expect(caughtLines().at(-1)).toContain('Could not read the clipboard (window: NotAllowedError)')
  })
})
