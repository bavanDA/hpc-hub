import { ArrowLeft, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { useGo } from '../../../nav'
import { call } from '../../../rpc'
import type { AskContext, AskKind } from '../../../types/code'
import type { Listing, TmuxSession } from '../../../types/terminals'
import { openSession } from '../../terminals/tabs'
import { useToast } from '../../toast'
import { startAgent } from '../../tools/run'
import { IconButton, Spinner, StatusPill } from '../../ui'
import { AGENT_NAMES, agentName, isRunning, loadAsks, type RunningAgent, useAsks } from '../ask'
import { AskForm, type ErrorSource } from '../AskForm'
import { Result } from '../Result'
import { languageFor, useLanguages } from './lang'

const LOG = /\.(out|err|log)$/i
const SHOWN: Record<string, string> = { starting: 'Starting', waiting_for_node: 'Waiting', running: 'Running',
  done: 'Answer ready', failed: "Didn't finish", cancelled: 'Stopped' }

/** Ask an agent about the open file, follow the answer, and find earlier asks on this cluster. */
export function AskPanel({ context, kind, logText, askId, onAsk, onOpenFile, onClose }: {
  context: AskContext | null   // the open file, with the selected lines
  kind: AskKind                // the shortcut you came from
  logText: () => string        // the open file's text, for "Fix this error" on a log
  askId: string | null
  onAsk: (id: string | null) => void
  onOpenFile: (cluster: string, path: string) => void
  onClose: () => void
}) {
  useLanguages()
  const go = useGo()
  const { asks } = useAsks()
  const [running, setRunning] = useState<RunningAgent[]>([])
  const [sessions, setSessions] = useState<TmuxSession[]>([])
  const toast = useToast()
  const cluster = context?.cluster ?? ''

  useEffect(() => {
    if (!cluster) return
    loadAsks(cluster).catch(() => {})
    call<Listing>('terminals.list', { cluster })
      .then((l) => {
        setSessions(l.sessions)
        setRunning(l.sessions.filter((s) => s.agent in AGENT_NAMES).map((s) => ({
          cluster, session: s.name, node: s.node, agent: s.agent, label: s.label || agentName(s.agent) })))
      })
      .catch(() => setRunning([]))
  }, [cluster])

  const errorSources: ErrorSource[] = context && LOG.test(context.path)
    ? [{ label: 'The end of this file', load: async () => logText().split('\n').slice(-80).join('\n') }] : []
  const mine = asks.filter((a) => !cluster || a.cluster === cluster)

  // a question sent to an agent already running: its answer comes in its terminal, so show that
  const sent = (to: RunningAgent) => {
    const s = sessions.find((x) => x.name === to.session)
    toast(`Sent to ${to.label}`)
    if (s) openSession(to.cluster, s)
    go('terminals')
  }

  const keepTalking = (c: string, chatId: string, agent: string) => {
    const folder = context?.path.replace(/\/[^/]*$/, '') || '~'
    startAgent(c, { agent, name: agentName(agent), folder, chat_id: chatId, label: '', task: '', options: {},
      new_node: false, remote_control: false, profile: null }, go)
  }

  return (
    <aside aria-label="Ask an agent" className="flex w-[380px] shrink-0 flex-col border-l border-line bg-window">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line pr-1 pl-3">
        {askId ? <IconButton icon={ArrowLeft} label="All asks" small onClick={() => onAsk(null)} />
          : <Sparkles size={16} className="text-dim" />}
        <h2 className="flex-1 font-semibold">{askId ? 'Answer' : 'Ask an agent'}</h2>
        <IconButton icon={X} label="Close the Ask panel" small onClick={onClose} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {askId ? (
          <Result askId={askId} languageFor={languageFor} onOpenFile={onOpenFile} onKeepTalking={keepTalking} />
        ) : context ? (
          <AskForm key={`${context.path}:${context.from_line ?? 0}:${context.to_line ?? 0}:${kind}`}
            context={context} kind={kind} errorSources={errorSources} running={running}
            fileKey={`${context.cluster}:${context.path}`} onStarted={(id) => onAsk(id)} onSent={sent} />
        ) : (
          <p className="text-sm text-dim">Open a file, then ask about it or about the lines you select.</p>
        )}
        {!askId && mine.length > 0 && (
          <section className="-mx-4 mt-6 flex flex-col">
            <h3 className="px-4 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">Earlier asks</h3>
            {mine.map((a) => (
              <button key={a.status.id} type="button" onClick={() => onAsk(a.status.id)}
                className="flex min-h-11 items-center gap-2 border-b border-line px-4 py-1.5 text-left first-of-type:border-t
                  hover:bg-hover active:bg-pressed">
                {isRunning(a) && <Spinner size={12} />}
                <span className="min-w-0 flex-1 truncate text-sm">
                  {agentName(a.status.agent)} · {a.status.path.split('/').pop()}</span>
                <StatusPill state={a.status.state === 'done' ? 'Completed' : a.status.state === 'failed' ? 'Failed'
                  : a.status.state === 'cancelled' ? 'Cancelled' : 'Running'}>{SHOWN[a.status.state]}</StatusPill>
                {!isRunning(a) && !a.seen && <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="New" />}
              </button>
            ))}
          </section>
        )}
      </div>
    </aside>
  )
}
