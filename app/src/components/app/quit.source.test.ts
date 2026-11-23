// Settings > Reset HPC Hub: the question shows at once (2026-11-22, "I click on this and still nothing happened":
// it waited for the backend's list of folders first, with no limit, so a slow backend showed nothing).
import { describe, expect, it } from 'vitest'

import src from './quit.tsx?raw'

const reset = src.slice(src.indexOf('const resetAndQuit'), src.indexOf('}, [close, end])', src.indexOf('const resetAndQuit')))

describe('Reset and Uninstall never show nothing', () => {
  it('the question shows before anything is asked of the backend', () => {
    expect(reset.indexOf('ask(null)')).toBeGreaterThan(-1)
    expect(reset.indexOf('ask(null)')).toBeLessThan(reset.indexOf("call<ResetInfo>('app.reset_info')"))
    expect(reset).not.toMatch(/^\s*const info = await call<ResetInfo>/m)
  })
  it("what the backend lists fills it in, within a limit, and never reopens a question you closed", () => {
    expect(reset).toContain("within(call<ResetInfo>('app.reset_info'), INFO_MS")
    expect(reset).toContain('if (open && info) ask(info)')
    expect(reset).toContain('const shut = () => { open = false; close() }')
  })
  it('a backend that never answers the reset itself says so', () => {
    expect(reset).toMatch(/within\(call\(kind === 'reset' \? 'app\.reset' : 'app\.uninstall'[^)]*\), RESET_MS/)
    expect(src).toMatch(/const within = <T,>\(p: Promise<T>, ms: number, what: string\) =>/)
  })
})
