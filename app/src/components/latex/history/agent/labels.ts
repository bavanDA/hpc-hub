import type { AgentChoice, AgentPick } from '../../../../types/history'

/** 'Opus · High' for the chip, the agent's name in place of a model it has no setting for ('ChatGPT · Medium'), and
 *  no effort when it has none ('Auto'). */
export function chipLabel(c: AgentPick, agents: AgentChoice['agents']): string {
  const a = agents.find((x) => x.id === c.agent)
  const model = a?.models.find(([v]) => v === c.model)?.[1]
  const effort = a?.efforts.find(([v]) => v === c.effort)?.[1]
  return [model && c.model ? model : a?.name ?? c.agent, effort && c.effort ? effort : ''].filter(Boolean).join(' · ')
}

/** 'Claude Haiku' for 'Claude Haiku, Low'. */
export const shortLabel = (label: string) => label.split(',')[0]

/** The agent behind a job's label, for its icon. */
export const agentOf = (label: string) => label.startsWith('ChatGPT') ? 'codex' : label.startsWith('Cursor') ? 'cursor'
  : label.startsWith('Antigravity') ? 'agy' : 'claude'
