import { describe, expect, it, vi } from 'vitest'

let answer: () => Promise<unknown> = async () => false
const asked: unknown[] = []
vi.mock('@tauri-apps/api/core', () => ({ invoke: (name: string) => { asked.push(name); return answer() } }))
vi.mock('./platform', () => ({ inTauri: true }))

import { RESTARTED, restartNote } from './windowRestart'

describe('the note after the window comes back', () => {
  it('says so after a crash, and that work went on', async () => {
    answer = async () => true
    expect(await restartNote()).toBe(RESTARTED)
    expect(asked).toEqual(['window_restarted'])
    expect(RESTARTED).toMatch(/kept running/)
  })

  it('says nothing on a normal start or an older window shell', async () => {
    answer = async () => false
    expect(await restartNote()).toBeNull()
    answer = async () => { throw new Error('command window_restarted not found') }  // quick fix on an older AppImage
    expect(await restartNote()).toBeNull()
  })
})
