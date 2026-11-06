import type { TmuxSession } from '../../types/terminals'
import { openLink } from '../app/openLink'
import { useToast } from '../useToast'
import { SessionIcon } from './Popover'
import { SessionMenu } from './SessionMenu'
import { sessionLines } from './sessionText'
import { openSession } from './tabs'
import { copyText } from './xterm'

export function SessionRow({ cluster, s, nodes, open, selected, onRefresh }: {
  cluster: string; s: TmuxSession; nodes: Record<string, string> | null; open: boolean; selected: boolean
  onRefresh: () => void
}) {
  const toast = useToast()
  const { title, sub } = sessionLines(s, open, nodes)
  const code = s.remote.startsWith('code:')
  const remoteAction = () => {
    if (!code) return openLink(s.remote)
    copyText(s.remote.slice(5)).then(() =>
      toast(`Pairing code ${s.remote.slice(5)} copied. In the ChatGPT app: Codex, connect a machine.`))
  }
  return (
    <div onClick={() => openSession(cluster, s)} title={`${s.name} (${s.kind})${s.path ? ` in ${s.path}` : ''}`}
      className={`flex min-h-12 items-center gap-3 border-b border-line py-1.5 pr-1.5 pl-4 ${
        selected ? 'bg-selected' : 'hover:bg-hover active:bg-pressed'}`}>
      <SessionIcon agent={s.agent} session={s.name} />
      <div className="min-w-0 flex-1">
        <div className="break-words">{title}</div>
        <div className="text-sm break-words text-dim">{sub}</div>
      </div>
      {(code || s.remote.startsWith('http')) && (
        <button onClick={(e) => { e.stopPropagation(); remoteAction() }}
          title={code ? `Copy pairing code ${s.remote.slice(5)}` : `Open remote: ${s.remote}`}
          className="h-8 shrink-0 rounded-md border border-line-strong px-2.5 text-sm font-semibold hover:bg-hover">
          {code ? 'Copy code' : 'Open'}</button>
      )}
      <SessionMenu target={{ cluster, name: s.name, kind: s.kind, node: s.node, title: s.title }} onChanged={onRefresh} />
    </div>
  )
}
