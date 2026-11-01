// One tmux session in a list: color, name, what runs in it and where. Tap opens it, a long press (or ⋮) shows its
// actions. An agent's remote-control link or ChatGPT pairing code gets its own Open / Copy button.
import { MoreVertical } from 'lucide-react'

import { openLink } from '@shared/components/app/openLink'
import { copyText } from '@shared/components/terminals/xterm'
import { AGENT_NAMES, type TmuxSession } from '@shared/types/terminals'
import { useToast } from '../../ui'
import { useLongPress } from './useLongPress'

function ago(ts: number): string {
  if (!ts) return ''
  const m = Math.floor(Math.max(0, Date.now() / 1000 - ts) / 60)
  return m < 60 ? `${m} min` : m < 48 * 60 ? `${Math.floor(m / 60)} h` : `${Math.floor(m / 1440)} days`
}

/** "Claude · thesis" -> "thesis" when the agent's name is already on the line below. */
export function shortTitle(s: TmuxSession, what: string): string {
  const t = s.title || s.name
  return t.startsWith(`${what} · `) ? t.slice(what.length + 3) : t
}

export function SessionRow({ s, open, nodes, extra = '', onOpen, onActions }: {
  s: TmuxSession; open: boolean; nodes: Record<string, string> | null; extra?: string
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
  const what = AGENT_NAMES[s.agent] ?? (s.kind === 'screen' ? 'screen' : 'Terminal')
  const line = [what, extra, node || 'login node', ago(s.created), state].filter(Boolean).join(' · ')
  const code = s.remote.startsWith('code:')
  const remote = code || s.remote.startsWith('http')
  const onRemote = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!code) { openLink(s.remote).catch((err) => toast(`Could not open it: ${err}`)); return }
    const pair = s.remote.slice(5)
    copyText(pair).then((ok) => toast(ok ? `Pairing code ${pair} copied. In the ChatGPT app: Codex, connect a machine.`
      : 'Could not copy'))
  }
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-card shadow-[var(--shadow-card)]">
      <button {...press} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-2xl py-3 pl-4 text-left
        select-none active:bg-hover">
        <span className="size-3 shrink-0 rounded-full" style={{ background: s.color || 'var(--color-dim)' }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{shortTitle(s, what)}</span>
          <span className="block truncate text-sm text-dim">{line}</span>
        </span>
      </button>
      {remote && (
        <button onClick={onRemote} className="h-11 shrink-0 rounded-xl px-3 text-sm font-bold text-accent-text
          active:bg-hover">{code ? 'Copy code' : 'Open remote'}</button>
      )}
      <button aria-label={`Actions for ${shortTitle(s, what)}`} onClick={onActions}
        className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-hover">
        <MoreVertical size={20} /></button>
    </div>
  )
}
