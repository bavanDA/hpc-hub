import type { Extension } from '@codemirror/state'
import { MessagesSquare } from 'lucide-react'
import { useEffect } from 'react'

import { cancelAsk, isRunning, loadResult, markSeen, useAsks } from './ask'
import { SECONDARY } from './buttons'
import { Markdown } from './Markdown'
import { ProposedFileView } from './ProposedFile'

type Props = {
  askId: string
  languageFor?: (path: string) => Extension[]  // the editor's language for a path (stable per path)
  onKeepTalking?: (cluster: string, chatId: string, agent: string) => void
  onOpenFile?: (cluster: string, path: string) => void  // after saving, show the file
}

/** An ask's outcome: the agent's answer, then a diff for each file it wants to change. */
export function Result({ askId, languageFor, onKeepTalking, onOpenFile }: Props) {
  const { asks } = useAsks()
  const ask = asks.find((a) => a.status.id === askId)

  useEffect(() => {
    if (ask && !isRunning(ask)) {
      markSeen(askId)
      if (ask.status.state === 'done' && !ask.result) void loadResult(askId)
    }
  }, [askId, ask?.status.state])  // eslint-disable-line react-hooks/exhaustive-deps

  if (!ask) return <p className="text-sm text-dim">This ask is gone.</p>

  if (isRunning(ask)) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-base">{ask.status.detail || 'Working on it'}</p>
        <p className="text-sm text-dim">It keeps going on the cluster while the app is closed.</p>
        {ask.error && <p className="text-sm text-bad">{ask.error}</p>}
        <button type="button" className={SECONDARY} onClick={() => void cancelAsk(askId)}>Stop</button>
      </div>
    )
  }

  if (ask.status.state !== 'done') {
    return (
      <p className="text-base text-dim">
        {ask.status.state === 'cancelled' ? 'You stopped this ask.' : ask.status.detail || "The agent couldn't finish."}
      </p>
    )
  }

  const result = ask.result
  if (!result) return <p className="text-sm text-dim">{ask.error || 'Getting the answer'}</p>

  return (
    <div className="flex flex-col gap-5">
      {result.answer.trim() && <Markdown text={result.answer} />}
      {result.files.map((f) => (
        <ProposedFileView key={f.path} cluster={ask.cluster} file={f} agent={ask.status.agent}
          languageFor={languageFor} onOpenFile={onOpenFile} />
      ))}
      {result.files.length === 0 && !result.answer.trim() && <p className="text-base text-dim">No answer came back.</p>}
      {result.chat_id && onKeepTalking && (
        <button type="button" className={`${SECONDARY} self-start`}
          onClick={() => onKeepTalking(ask.cluster, result.chat_id, ask.status.agent)}>
          <MessagesSquare size={16} /> Keep talking
        </button>
      )}
    </div>
  )
}
