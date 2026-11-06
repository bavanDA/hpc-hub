import { FlaskConical, MessageSquare, MousePointer2, Star } from 'lucide-react'

const ICONS: Record<string, typeof Star> = { claude: Star, codex: MessageSquare, agy: FlaskConical, cursor: MousePointer2 }

export function AgentIcon({ agent, size = 12 }: { agent: string; size?: number }) {
  const I = ICONS[agent] ?? Star
  return (
    <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] border border-line-strong text-dim">
      <I size={size} /></span>
  )
}
