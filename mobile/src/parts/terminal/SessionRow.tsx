// One tmux session in a list: its icon (the agent's own logo, or a plain terminal), name, what runs in it and how
// long. Tap opens it, a long press (or ⋮) shows its actions. An agent's remote-control link or ChatGPT pairing code
// gets its own Remote / Copy code button.
import { Code, MessagesSquare, MoreVertical, SquareTerminal, type LucideIcon } from 'lucide-react'

import { agentIcon } from '@shared/components/agents/AgentIcon'
import { openLink } from '@shared/components/app/openLink'
import { copyText } from '@shared/components/terminals/xterm'
import { AGENT_NAMES, type TmuxSession } from '@shared/types/terminals'
import { Button, useToast } from '../../ui'
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
  const toast = useToast()
  const press = useLongPress(onOpen, onActions)
  let state = open ? 'open' : s.attached ? 'open in another window' : ''
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
  const code = s.remote.startsWith('code:')
  const remote = code || s.remote.startsWith('http')
  const onRemote = () => {
    if (!code) { openLink(s.remote).catch((err) => toast(`Could not open it: ${err}`)); return }
    const pair = s.remote.slice(5)
    copyText(pair).then((ok) => toast(ok ? `Pairing code ${pair} copied. In the ChatGPT app: Codex, connect a machine.`
      : 'Could not copy'))
  }
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
      {remote && <Button kind="quiet" className="shrink-0 text-sm" onClick={onRemote}
        title={code ? 'Copy the ChatGPT pairing code' : 'Open remote control'}>{code ? 'Copy code' : 'Remote'}</Button>}
      <button aria-label={`Actions for ${shortTitle(s, what)}`} onClick={onActions}
        className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed">
        <MoreVertical size={20} /></button>
    </div>
  )
}
