// One session in the list, the desktop's row: its logo, name, what runs and where, Open for an agent's remote control
// (Copy code for ChatGPT's), and ⋮. A tap opens it.
import { MoreVertical } from 'lucide-react'

import { openLink } from '@shared/components/app/openLink'
import { SessionIcon } from '@shared/components/terminals/SessionIcon'
import { sessionLines } from '@shared/components/terminals/sessionText'
import { openSession } from '@shared/components/terminals/tabs'
import { copyText } from '@shared/components/terminals/xterm'
import type { TmuxSession } from '@shared/types/terminals'
import { Button, Menu, useToast } from '../../ui'
import { useSessionMenu } from './sessionMenu'

export function TerminalRow({ cluster, s, nodes, open, onRefresh }: {
  cluster: string; s: TmuxSession; nodes: Record<string, string> | null; open: boolean; onRefresh: () => void
}) {
  const toast = useToast()
  const { title, sub } = sessionLines(s, open, nodes)
  const { items, dialog } = useSessionMenu({ cluster, name: s.name, kind: s.kind, node: s.node, title: s.title },
    onRefresh)
  const code = s.remote.startsWith('code:')
  const remote = () => {
    if (!code) return openLink(s.remote).catch((e) => toast(`Could not open it: ${e}`))
    void copyText(s.remote.slice(5)).then(() =>
      toast(`Pairing code ${s.remote.slice(5)} copied. In the ChatGPT app: Codex, connect a machine.`))
  }
  return (
    <div onClick={() => openSession(cluster, s)} className="flex min-h-12 items-center gap-3 border-b border-line py-1.5
      pr-1.5 pl-4 active:bg-pressed">
      <SessionIcon agent={s.agent} session={s.name} size={20} />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <div>{title}</div>
        <div className="text-sm text-dim">{sub}</div>
      </div>
      {(code || s.remote.startsWith('http')) && (
        <Button small onClick={(e) => { e.stopPropagation(); void remote() }}>{code ? 'Copy code' : 'Open'}</Button>
      )}
      <span className="contents" onClick={(e) => e.stopPropagation()}>
        <Menu label="More" groups={[items]} trigger={<MoreVertical size={18} />}
          className="grid size-9 shrink-0 place-items-center rounded-md text-dim active:bg-pressed" />
        {dialog}
      </span>
    </div>
  )
}
