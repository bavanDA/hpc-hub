import { describe, expect, it } from 'vitest'

import { canContinue, continueLabel, endedNote } from './continueChat'
import tabsSource from './tabs.ts?raw'

// 2026-11-22, the owner: an ended Claude tab gets a Continue button that picks the chat up again
describe('Continue on an ended tab', () => {
  it('a Claude chat HPC Hub started can be continued', () => {
    expect(canContinue('hpchub-claude-1621596-3f2a9c1e')).toBe(true)
    expect(canContinue('hpchub-claude-3f2a9c1e')).toBe(true)  // older tabs named no job
  })

  it('other tabs can not: they have no saved chat to find', () => {
    for (const s of ['hpchub-term-1122-101010', 'hpchub-codex-1621596-3f2a9c1e', 'hpchub-claude-1621596-101010',
      'work', 'hpchub-claude-1-3f2a9c1e; rm -rf ~']) expect(canContinue(s)).toBe(false)
  })

  it('a Claude tab says Continue; others say what they always said', () => {
    expect(endedNote('hpchub-claude-1621596-3f2a9c1e')).toEqual({
      text: 'This Claude session has ended. Continue the chat where it stopped, or close this tab.', button: 'Continue' })
    expect(endedNote('hpchub-term-1122-101010').button).toBeUndefined()
  })

  it('the new tab keeps the old one\'s name', () => {
    expect(continueLabel('Claude · HANDOFF.md')).toBe('HANDOFF.md')
    expect(continueLabel('Claude·thesis')).toBe('thesis')
    expect(continueLabel('my own name')).toBe('my own name')
  })

  it('an ended session offers it, and Continue resumes the same chat by its id', () => {
    expect(tabsSource).toContain("note.button ? () => void continueChat(tab) : undefined")
    expect(tabsSource).toMatch(/call<\{ chat_id: string; folder: string \}>\('chat\.where'/)
    expect(tabsSource).toMatch(/'tools\.agent_start', \{ cluster, agent: 'claude', folder: at\.folder,\s+chat_id: at\.chat_id/)
  })
})
