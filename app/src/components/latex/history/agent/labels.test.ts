import { describe, expect, it } from 'vitest'

import type { AgentDesc } from '../../../../types/history'
import { agentOf, chipLabel, shortLabel } from './labels'

const agents: AgentDesc[] = [
  { id: 'claude', name: 'Claude', models: [['opus', 'Opus']], efforts: [['high', 'High']] },
  { id: 'codex', name: 'ChatGPT', models: [], efforts: [['medium', 'Medium']] },
  { id: 'cursor', name: 'Cursor', models: [['auto', 'Auto']], efforts: [] },
]

describe('agent labels', () => {
  it('chipLabel', () => {
    expect(chipLabel({ agent: 'claude', model: 'opus', effort: 'high' }, agents)).toBe('Opus · High')
    expect(chipLabel({ agent: 'codex', model: '', effort: 'medium' }, agents)).toBe('ChatGPT · Medium')
    expect(chipLabel({ agent: 'cursor', model: 'auto', effort: '' }, agents)).toBe('Auto')
    expect(chipLabel({ agent: 'other', model: '', effort: '' }, agents)).toBe('other')
  })
  it('shortLabel and agentOf', () => {
    expect(shortLabel('Claude Haiku, Low')).toBe('Claude Haiku')
    expect(agentOf('ChatGPT 5, High')).toBe('codex')
    expect(agentOf('Cursor Auto')).toBe('cursor')
    expect(agentOf('Antigravity')).toBe('agy')
    expect(agentOf('Claude Opus')).toBe('claude')
  })
})
