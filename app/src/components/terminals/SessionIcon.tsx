import { SquareTerminal } from 'lucide-react'

import { agentIcon } from '../agents/AgentIcon'

const LOGO = new Set(['claude', 'codex', 'agy', 'cursor'])

/** An agent's own logo for its session (named hpchub-<agent>-…), a grey terminal for the rest. */
export function SessionIcon({ agent = '', session = '', size = 16 }: { agent?: string; session?: string; size?: number }) {
  const id = LOGO.has(agent) ? agent : /^hpchub-([a-z]+)-/.exec(session)?.[1] ?? ''
  const Icon = LOGO.has(id) ? agentIcon(id) : SquareTerminal
  return <Icon size={size} className="shrink-0 text-dim" />
}
