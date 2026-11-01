// Ask an agent about the open file or the selected lines: Explain this, Fix this error, Write a test, or your own
// question. It runs once on the cluster, or goes to an agent that is already running there. Your earlier asks on
// this cluster are listed on top, so a result is one tap away after the app was closed.
import { useEffect, useMemo, useState } from 'react'

import { AskForm, type ErrorSource } from '@shared/components/code/AskForm'
import { agentName, isRunning, loadAsks, useAsks, type RunningAgent } from '@shared/components/code/ask'
import { openFiles } from '@shared/components/code/store'
import { call } from '@shared/rpc'
import type { AskContext, AskKind } from '@shared/types/code'
import type { Listing, TmuxSession } from '@shared/types/terminals'
import { ListRow, Sheet } from '../../ui'
import { isLog, lastError, nameOf } from './util'

const AGENTS = ['claude', 'codex', 'agy', 'cursor']

export type AskStart = { context: AskContext; kind: AskKind; errorText?: string; fileKey?: string }

type Props = AskStart & {
  onClose: () => void
  onStarted: (id: string) => void
  onOpenAsk: (id: string) => void
  onSent: (cluster: string, session: TmuxSession, label: string) => void
}

export function AskSheet({ context, kind, errorText, fileKey, onClose, onStarted, onOpenAsk, onSent }: Props) {
  const { asks } = useAsks()
  const [sessions, setSessions] = useState<TmuxSession[]>([])
  const mine = asks.filter((a) => a.cluster === context.cluster).slice(0, 5)

  useEffect(() => {
    loadAsks(context.cluster).catch(() => {})
    call<Listing>('terminals.list', { cluster: context.cluster })
      .then((l) => setSessions(l.sessions.filter((s) => AGENTS.includes(s.agent)))).catch(() => setSessions([]))
  }, [context.cluster])

  const running: RunningAgent[] = useMemo(() => sessions.map((s) => ({ cluster: context.cluster, session: s.name,
    node: s.node, agent: s.agent, label: s.title || agentName(s.agent) })), [sessions, context.cluster])

  // "Fix this error": the error at the end of each open log, as a ready source
  const errorSources: ErrorSource[] = openFiles().filter((f) => f.cluster === context.cluster && isLog(f.path) && f.text)
    .map((f) => ({ label: `End of ${nameOf(f.path)}`, load: async () => lastError(f.text) || f.text.split('\n').slice(-40).join('\n') }))

  return (
    <Sheet title="Ask an agent" onClose={onClose}>
      {mine.length > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-sm font-semibold text-dim">Your asks here</p>
          {mine.map((a) => (
            <ListRow key={a.status.id} title={`${agentName(a.status.agent)} on ${nameOf(a.status.path)}`}
              subtitle={isRunning(a) ? a.status.detail || 'Working on it' : a.status.state === 'done'
                ? (a.seen ? 'Answered' : 'New answer') : a.status.detail || 'Stopped'}
              onClick={() => onOpenAsk(a.status.id)} />
          ))}
        </div>
      )}
      <AskForm context={context} kind={kind} errorText={errorText} errorSources={errorSources} running={running}
        fileKey={fileKey} onStarted={onStarted}
        onSent={(to) => {
          const s = sessions.find((x) => x.name === to.session)
          if (s) onSent(context.cluster, s, to.label)
        }} />
    </Sheet>
  )
}
