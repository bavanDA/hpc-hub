// Each agent's own logo (assets/agents, see its README), drawn like a lucide icon so menus and sheets take it as
// one. Built with HPC_HUB_PLAIN_ICONS=1 every agent gets the plain robot instead.
import { Bot, type LucideIcon, type LucideProps } from 'lucide-react'
import { forwardRef } from 'react'

import antigravity from '../../assets/agents/antigravity.svg?raw'
import claude from '../../assets/agents/claude.svg?raw'
import cursor from '../../assets/agents/cursor.svg?raw'
import openai from '../../assets/agents/openai.svg?raw'

const PLAIN_ICONS = import.meta.env.HPC_HUB_PLAIN_ICONS === '1'

const paths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1])

// Claude's coral and Antigravity's blue; OpenAI and Cursor are black or white, so they follow the text
function logo(name: string, svg: string, color: string): LucideIcon {
  const d = paths(svg)
  const Icon = forwardRef<SVGSVGElement, Omit<LucideProps, 'ref'>>(({ size = 24, className, style }, ref) => (
    <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size}
      fill="currentColor" fillRule="evenodd" aria-hidden className={className} style={{ color, ...style }}>
      {d.map((x) => <path key={x} d={x} />)}
    </svg>
  ))
  Icon.displayName = name
  return Icon as LucideIcon
}

const LOGOS: Record<string, LucideIcon> = {
  claude: logo('Claude', claude, '#D97757'),
  codex: logo('OpenAI', openai, 'var(--color-text)'),
  agy: logo('Antigravity', antigravity, '#3186FF'),
  cursor: logo('Cursor', cursor, 'var(--color-text)'),
}

/** The icon for an agent id (claude, codex, agy, cursor; "agent:" in front is fine). */
export function agentIcon(id: string): LucideIcon {
  return (!PLAIN_ICONS && LOGOS[id.replace(/^agent:/, '')]) || Bot
}
