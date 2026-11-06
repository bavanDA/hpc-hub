import { MessagesSquare, SquareTerminal, type LucideIcon } from 'lucide-react'

import { agentIcon } from './AgentIcon'

export const STARTABLE = ['claude', 'codex', 'agy', 'cursor'] as const

/** The agent's own logo; Ask all and anything else a plain grey icon. */
export const iconOf = (agent: string): LucideIcon => (STARTABLE as readonly string[]).includes(agent) ? agentIcon(agent)
  : agent === 'ask' ? MessagesSquare : SquareTerminal
