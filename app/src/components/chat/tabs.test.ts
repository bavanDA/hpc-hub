import { describe, expect, it } from 'vitest'

import { isClaudeTab, tagOf } from './tabs'

describe('which tabs have a Chat view', () => {
  it('Claude tabs started with a chat id', () => {
    expect(tagOf('hpchub-claude-1606417-3f2a9c1e')).toBe('3f2a9c1e')
    expect(tagOf('hpchub-claude-123-142233')).toBe('')  // started before HPC Hub chose the id
    expect(isClaudeTab({ session: 'hpchub-claude-123-142233' })).toBe(true)
    expect(isClaudeTab({ session: 'hpchub-codex-123-3f2a9c1e' })).toBe(false)
  })
})
