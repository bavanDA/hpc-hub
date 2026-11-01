// An ask's outcome: the agent's answer, then each file it wants to change as a diff to accept or reject piece by
// piece. "Accept and save" puts the result in the editor and saves it (with the usual check that the file is still
// the one the agent read); "Keep talking" hands the chat to the shell, which opens it in a terminal.
import type { Extension } from '@codemirror/state'
import { FilePlus2, MessagesSquare } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { ProposedFile } from '../../types/code'
import { AGENT_NAMES as AGENTS, cancelAsk, isRunning, loadResult, markSeen, useAsks } from './ask'
import { Diff, type DiffHandle } from './Diff'
import { Markdown } from './Markdown'
import { fileKey, getFile, isDirty, openFile, replaceText, saveFile, useCode } from './store'

type Props = {
  askId: string
  languageFor?: (path: string) => Extension[]  // the editor's language for a path (stable per path)
  onKeepTalking?: (cluster: string, chatId: string, agent: string) => void
  onOpenFile?: (cluster: string, path: string) => void  // after saving, show the file
}

const BUTTON = 'inline-flex h-[34px] items-center justify-center gap-2 rounded-md px-4 text-base font-semibold ' +
  'transition-colors duration-90 disabled:opacity-45 pointer-coarse:h-12 pointer-coarse:px-5 pointer-coarse:text-md'
const PRIMARY = `${BUTTON} bg-accent text-white hover:bg-accent-hover active:bg-accent-pressed`
const SECONDARY = `${BUTTON} bg-control text-text hover:bg-hover active:bg-pressed`

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

function ProposedFileView({ cluster, file, agent, languageFor, onOpenFile }:
  { cluster: string; file: ProposedFile; agent: string; languageFor?: (path: string) => Extension[]
    onOpenFile?: (cluster: string, path: string) => void }) {
  const extensions = useMemo(() => languageFor?.(file.path), [languageFor, file.path])
  useCode()  // redraw when the open file changes (you kept typing)
  const key = fileKey(cluster, file.path)
  const open = getFile(key)
  // compare against what you have now: your edits since the ask count, not the agent's old snapshot
  const base = open && !open.loading ? open.text : file.original
  const changedSince = Boolean(open && !open.loading && (open.sha !== file.base_sha || isDirty(open)) && !file.is_new)
  const handle = useRef<DiffHandle | null>(null)
  const [left, setLeft] = useState(0)
  const [state, setState] = useState<'' | 'busy' | 'saved' | 'applied'>('')
  const [problem, setProblem] = useState('')
  const name = file.path.split('/').pop()
  const who = AGENTS[agent] ?? 'The agent'

  async function apply(save: boolean) {
    const text = handle.current?.text() ?? file.proposed
    setState('busy')
    setProblem('')
    try {
      if (file.is_new) {
        await call('code.new_file', { cluster, path: file.path, text })
        await openFile(cluster, file.path)
        setState('saved')
      } else {
        if (!getFile(key)) await openFile(cluster, file.path)
        replaceText(key, text)
        if (!save) {
          setState('applied')
          return
        }
        const r = await saveFile(key)
        if (r.saved) setState('saved')
        else {
          setState('applied')
          setProblem(r.conflict ? `${name} changed on the cluster. It's in the editor, not saved.` : r.error)
        }
      }
      onOpenFile?.(cluster, file.path)
    } catch (e) {
      setState('')
      setProblem((e as Error).message)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {file.is_new && <FilePlus2 size={16} className="text-accent-text" />}
        <p className="min-w-0 flex-1 truncate font-semibold">
          {file.is_new ? `New file ${file.path}` : `${who} suggests ${left === 1 ? 'a change' : `${left} changes`} to ${name}`}
        </p>
      </div>
      {changedSince && <p className="text-sm text-warn">You changed {name} since you asked. This compares with your version.</p>}
      <Diff original={base} proposed={file.proposed} isNew={file.is_new} extensions={extensions} handle={handle}
        onChange={(_t, n) => setLeft(n)} />
      {state === 'saved' && <p className="text-sm text-ok">Saved on the cluster.</p>}
      {state === 'applied' && !problem && <p className="text-sm text-dim">In the editor. Save when you're ready.</p>}
      {problem && <p className="text-sm text-bad">{problem}</p>}
      {state !== 'saved' && (
        <div className="flex flex-wrap gap-2">
          {!file.is_new && (
            <>
              <button type="button" className={SECONDARY} disabled={state === 'busy' || left === 0}
                onClick={() => handle.current?.rejectAll()}>Reject all</button>
              <button type="button" className={SECONDARY} disabled={state === 'busy'}
                onClick={() => void apply(false)}>Put in editor</button>
            </>
          )}
          <button type="button" className={PRIMARY} disabled={state === 'busy'} onClick={() => void apply(true)}>
            {file.is_new ? 'Add file' : left > 0 ? 'Accept and save' : 'Save'}
          </button>
        </div>
      )}
    </section>
  )
}
