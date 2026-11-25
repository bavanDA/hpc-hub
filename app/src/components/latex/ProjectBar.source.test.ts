// 2026-11-25, owner: "remove open button, it is redundant". The paper's bar keeps the views, build, Git and close.
import { describe, expect, it } from 'vitest'

import bar from './ProjectBar.tsx?raw'
import project from './Project.tsx?raw'

describe("the paper's bar", () => {
  it('has no Open button', () => {
    expect(bar).not.toContain('Open</button>')
    expect(bar).not.toContain('onOpenIn')
    expect(project).not.toContain('OpenDialog')
  })
  it('keeps the files toggle and close', () => {
    expect(bar).toContain('aria-label="Show or hide the files"')
    expect(bar).toContain('aria-label="Close project"')
  })
})
