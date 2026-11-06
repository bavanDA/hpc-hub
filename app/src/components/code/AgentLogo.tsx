import { createElement } from 'react'

import { agentIcon } from '../agents/AgentIcon'

/** The agent's logo in a chip; the black and white ones take the chip's text color, so they show when it's on. */
export function AgentLogo({ agent }: { agent: string }) {
  return createElement(agentIcon(agent), { size: 14, className: 'shrink-0',
    style: agent === 'claude' || agent === 'agy' ? undefined : { color: 'inherit' } })
}
