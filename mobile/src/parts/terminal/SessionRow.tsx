// One tmux session in a list: its icon (the agent's own logo, or a plain terminal), name, what runs in it and how
// long. Tap opens it, a long press (or ⋮) shows its actions (an agent's remote control is there too).
import { Code, MessagesSquare, MoreVertical, SquareTerminal, type LucideIcon } from 'lucide-react'

import { agentIcon } from '@shared/components/agents/AgentIcon'
import { AGENT_NAMES, type TmuxSession } from '@shared/types/terminals'
import { useLongPress } from './useLongPress'

function ago(ts: number): string {
  if (!ts) return ''
  const m = Math.floor(Math.max(0, Date.now() / 1000 - ts) / 60)
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`
}

/** "Claude · thesis" -> "thesis" when the agent's name is already on the line below. */
export function shortTitle(s: TmuxSession, what: string): string {
  const t = s.title || s.name
  return t.startsWith(`${what} · `) ? t.slice(what.length + 3) : t
}

/** The agent's logo for an agent session, otherwise a plain grey icon. */
export function sessionIcon(agent: string): LucideIcon {
  if (['claude', 'codex', 'agy', 'cursor'].includes(agent)) return agentIcon(agent)
  return agent === 'vscode' ? Code : agent === 'ask' ? MessagesSquare : SquareTerminal
}

/** here: the node the list is about (its header says it), left off the row; '' is the login node. */
export function SessionRow({ s, open, nodes, here = '', extra = '', onOpen, onActions }: {
  s: TmuxSession; open: boolean; nodes: Record<string, string> | null; here?: string; extra?: string
  onOpen: () => void; onActions: () => void
}) {
  const press = useLongPress(onOpen, onActions)
  let state = open ? 'open' : s.attached ? 'open elsewhere' : ''
  let node = s.node
  if (!node && s.job && nodes) {
    node = nodes[s.job] ?? 'node ended'
    if (node === 'node ended') state = ''
  }
  const agent = AGENT_NAMES[s.agent] && s.agent !== 'term' ? AGENT_NAMES[s.agent] : ''
  const what = agent || (s.agent === 'vscode' ? 'VS Code' : s.kind === 'screen' ? 'screen' : 'Terminal')
  const where = node === here ? '' : node || 'login node'
  const line = [agent || (s.kind === 'screen' ? 'screen' : ''), extra, where, ago(s.created), state]
    .filter(Boolean).join(' · ')
  const Icon = sessionIcon(s.agent)
  return (
    <div className="flex items-center border-b border-line pr-1">
      <button {...press} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 py-2.5 pl-4 text-left select-none
        active:bg-pressed">
        <Icon size={22} className="shrink-0 text-dim" />
        <span className="min-w-0 flex-1 break-words">
          <span className="block font-medium">{shortTitle(s, what)}</span>
          {line && <span className="block text-sm text-dim">{line}</span>}
        </span>
      </button>
      <button aria-label={`Actions for ${shortTitle(s, what)}`} onClick={onActions}
        className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed">
        <MoreVertical size={20} /></button>
    </div>
  )
}
