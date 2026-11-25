import { describe, expect, it } from 'vitest'

import { canContinue, chatAgent, continueLabel, endedNote } from './continueChat'
import tabsSource from './tabs.ts?raw'

// 2026-11-22, the owner: an ended Claude tab gets a Continue button that picks the chat up again
// 2026-11-25, on an ended ChatGPT tab: "where is the continue button" (Codex chats too)
describe('Continue on an ended tab', () => {
  it('a Claude chat HPC Hub started can be continued', () => {
    expect(canContinue('hpchub-claude-1621596-3f2a9c1e')).toBe(true)
    expect(canContinue('hpchub-claude-3f2a9c1e')).toBe(true)  // older tabs named no job
    expect(chatAgent('hpchub-claude-1621596-3f2a9c1e')).toBe('claude')
  })

  it('a ChatGPT chat HPC Hub started can be continued: a new one (its start time) or a resumed one', () => {
    for (const s of ['hpchub-codex-1659999-143015', 'hpchub-codex-1659999-3f2a9c1e', 'hpchub-codex-143015']) {
      expect(canContinue(s)).toBe(true)
      expect(chatAgent(s)).toBe('codex')
    }
  })

  it('other tabs can not: they have no saved chat to find', () => {
    for (const s of ['hpchub-term-1122-101010', 'hpchub-claude-1621596-101010', 'hpchub-codex-0930',
      'hpchub-codex-1659999-1430', 'hpchub-agy-1659999-143015', 'work', 'hpchub-claude-1-3f2a9c1e; rm -rf ~',
      'hpchub-codex-1659999-143015; rm -rf ~']) {
      expect(canContinue(s)).toBe(false)
      expect(chatAgent(s)).toBe('')
    }
  })

  it('a Claude or ChatGPT tab says Continue; others say what they always said', () => {
    expect(endedNote('hpchub-claude-1621596-3f2a9c1e')).toEqual({
      text: 'This Claude session has ended. Continue the chat where it stopped, or close this tab.', button: 'Continue' })
    expect(endedNote('hpchub-codex-1659999-143015')).toEqual({
      text: 'This ChatGPT session has ended. Continue the chat where it stopped, or close this tab.', button: 'Continue' })
    expect(endedNote('hpchub-term-1122-101010').button).toBeUndefined()
  })

  it('the new tab keeps the old one\'s name', () => {
    expect(continueLabel('Claude · HANDOFF.md')).toBe('HANDOFF.md')
    expect(continueLabel('Claude·thesis')).toBe('thesis')
    expect(continueLabel('ChatGPT · thesis')).toBe('thesis')
    expect(continueLabel('ChatGPT·thesis')).toBe('thesis')
    expect(continueLabel('my own name')).toBe('my own name')
  })

  it('an ended session offers it, and Continue resumes the same chat by its id, with the same agent', () => {
    expect(tabsSource).toContain("note.button ? () => void continueChat(tab) : undefined")
    expect(tabsSource).toMatch(/call<\{ chat_id: string; folder: string \}>\('chat\.where', \{ cluster, session, title \}/)
    expect(tabsSource).toContain("const agent = chatAgent(session) || 'claude'")
    expect(tabsSource).toMatch(/'tools\.agent_start', \{ cluster, agent, folder: at\.folder,\s+chat_id: at\.chat_id/)
  })
})
