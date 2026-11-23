// The Code page's terminal panel shows only terminals: never Claude's chat, nor the Chat | Terminal switch
// (2026-11-22, owner: "in the code you should only show the terminal").
import { describe, expect, it } from 'vitest'

import view from '../../terminals/TerminalView.tsx?raw'
import terminals from '../../../pages/Terminals.tsx?raw'
import panel from './TerminalPanel.tsx?raw'

describe('terminals in the Code page are only terminals', () => {
  it('the panel asks for the plain terminal', () => {
    expect(panel).toMatch(/<TerminalView key=\{t\.key\} tab=\{t\} shown=\{[^}]+\} plain \/>/)
  })
  it('a plain terminal is never taken for a Claude chat: no switch, no chat', () => {
    expect(view).toContain("const claude = !plain && isClaudeTab(tab) && tab.cluster !== ''")
    expect(view).toContain('const chat = claude && view === \'chat\'')
    expect(view).toMatch(/const toggle = claude && \(/)
  })
  it('the Terminals page keeps its Chat | Terminal switch', () => {
    expect(terminals).toMatch(/<TerminalView key=\{t\.key\} tab=\{t\} shown=\{t\.key === current\} rail \/>/)
  })
})
