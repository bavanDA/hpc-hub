// What to ask an agent about some code, shared by the phone's Ask sheet and the desktop's Ask panel: which lines
// (or the whole file), which agent, a shortcut or your own words, the error for "Fix this error", and where it runs.
// It either starts a one-shot ask on the cluster (ask.ts) or sends the question to an agent already running there.
import { ClipboardPaste } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { AskContext, AskKind } from '../../types/code'
import { useClusters } from '../clusters/store'
import { AGENT_NAMES as AGENTS, sendToAgent, startAsk, type RunningAgent } from './ask'

export type ErrorSource = { label: string; load: () => Promise<string> }  // e.g. "Errors of job 123456"

type Props = {
  context: AskContext       // the file, with from_line/to_line when there is a selection
  kind?: AskKind            // the shortcut you came from (Explain on the selection bar, Fix this error, ...)
  errorText?: string        // an error already picked (a job's .err)
  errorSources?: ErrorSource[]
  running?: RunningAgent[]  // agents running on this cluster, to send to instead of a one-shot ask
  fileKey?: string          // the open file, so a running agent's change to it can be undone
  onStarted: (askId: string) => void
  onSent?: (to: RunningAgent) => void
}

const SHORTCUTS: { kind: AskKind; label: string }[] = [
  { kind: 'explain', label: 'Explain this' }, { kind: 'fix', label: 'Fix this error' },
  { kind: 'test', label: 'Write a test' },
]
const LAST = 'hpc-hub-code-agent'

function remembered(): string {
  try { return localStorage.getItem(LAST) ?? '' } catch { return '' }
}

const CHIP = 'inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3 text-sm font-semibold transition-colors ' +
  'duration-90 pointer-coarse:min-h-11 pointer-coarse:px-4 pointer-coarse:text-base'
const chip = (on: boolean) => `${CHIP} ${on ? 'bg-text text-window' : 'bg-control text-text hover:bg-hover'}`

export function AskForm({ context, kind: firstKind = 'free', errorText = '', errorSources = [], running = [],
  fileKey, onStarted, onSent }: Props) {
  const { sessions } = useClusters()
  const [agents, setAgents] = useState<string[] | null>(null)
  const [agent, setAgent] = useState(remembered())
  const [kind, setKind] = useState<AskKind>(firstKind)
  const [question, setQuestion] = useState('')
  const [error, setError] = useState(errorText)
  const [whole, setWhole] = useState(!context.from_line)
  const [to, setTo] = useState<string>('')  // '' = a one-shot ask; else a running agent's session
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')

  useEffect(() => {
    call<string[]>('tools.installed', { cluster: context.cluster })
      .then((found) => {
        const list = found.filter((a) => a in AGENTS)
        setAgents(list)
        setAgent((a) => (list.includes(a) ? a : list[0] ?? ''))
      })
      .catch(() => setAgents([]))
  }, [context.cluster])

  const ctx: AskContext = whole ? { cluster: context.cluster, path: context.path } : context
  const target = running.find((r) => r.session === to)
  const node = sessions[context.cluster]?.node
  const name = context.path.split('/').pop()
  const lines = context.from_line
    ? (context.from_line === context.to_line ? `line ${context.from_line}` : `lines ${context.from_line} to ${context.to_line}`)
    : ''
  const ready = !busy && (target || agent) && (kind !== 'free' || question.trim()) && (kind !== 'fix' || error.trim())

  async function go() {
    setBusy(true)
    setProblem('')
    try {
      if (target) {
        await sendToAgent(target, ctx, kind, question, kind === 'fix' ? error : '', fileKey)
        onSent?.(target)
      } else {
        try { localStorage.setItem(LAST, agent) } catch { /* private window */ }
        const id = await startAsk({ ...ctx, agent, kind, question: question.trim(),
          ...(kind === 'fix' ? { error_text: error.trim() } : {}) })
        onStarted(id)
      }
    } catch (e) {
      setProblem((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function paste(load: () => Promise<string>) {
    try {
      const text = await load()
      if (text.trim()) setError(text)
      else setProblem('Nothing to paste')
    } catch (e) {
      setProblem((e as Error).message)
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); if (ready) void go() }}>
      <div className="flex flex-wrap gap-2">
        {context.from_line && (
          <button type="button" className={chip(!whole)} onClick={() => setWhole(false)}>{name}, {lines}</button>
        )}
        <button type="button" className={chip(whole)} onClick={() => setWhole(true)}>All of {name}</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {SHORTCUTS.map((s) => (
          <button key={s.kind} type="button" className={chip(kind === s.kind)}
            onClick={() => setKind(kind === s.kind ? 'free' : s.kind)}>{s.label}</button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-dim">{kind === 'free' ? 'Your question' : 'Anything to add'}</span>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3}
          placeholder={kind === 'free' ? 'Ask anything about this code' : 'Optional'}
          className="min-h-20 rounded-md bg-control px-3 py-2 text-base text-text outline-none placeholder:text-faint
            focus-visible:ring-2 focus-visible:ring-focus pointer-coarse:text-md" />
      </label>

      {kind === 'fix' && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-dim">The error</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(false)} onClick={() => void paste(() => navigator.clipboard.readText())}>
              <ClipboardPaste size={14} /> Paste
            </button>
            {errorSources.map((s) => (
              <button key={s.label} type="button" className={chip(false)} onClick={() => void paste(s.load)}>{s.label}</button>
            ))}
          </div>
          <textarea value={error} onChange={(e) => setError(e.target.value)} rows={5} spellCheck={false}
            placeholder="Paste the error or the last lines of the output"
            className="min-h-28 rounded-md bg-control px-3 py-2 font-mono text-sm text-text outline-none
              placeholder:font-sans placeholder:text-faint focus-visible:ring-2 focus-visible:ring-focus" />
        </div>
      )}

      {running.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-dim">Send to</span>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={chip(to === '')} onClick={() => setTo('')}>A quick ask</button>
            {running.map((r) => (
              <button key={r.session} type="button" className={chip(to === r.session)} onClick={() => setTo(r.session)}>
                {r.label || AGENTS[r.agent] || r.agent} (running)
              </button>
            ))}
          </div>
        </div>
      )}

      {!target && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-dim">Agent</span>
          {agents === null
            ? <span className="text-sm text-dim">Looking for agents on the cluster</span>
            : agents.length === 0
              ? <span className="text-sm text-dim">No agent is installed on this cluster yet.</span>
              : (
                <div className="flex flex-wrap gap-2">
                  {agents.map((a) => (
                    <button key={a} type="button" className={chip(agent === a)} onClick={() => setAgent(a)}>{AGENTS[a]}</button>
                  ))}
                </div>
              )}
        </div>
      )}

      <p className="text-sm text-dim">
        {target
          ? `Goes to ${target.label || AGENTS[target.agent] || target.agent} in its terminal.`
          : node ? `Runs on your node ${node}.` : 'Asks for a node first, usually about a minute.'}
      </p>

      {problem && <p className="text-sm text-bad">{problem}</p>}

      <button type="submit" disabled={!ready}
        className="inline-flex h-[34px] items-center justify-center gap-2 rounded-md bg-accent px-4 text-base font-semibold
          text-white transition-colors duration-90 hover:bg-accent-hover active:bg-accent-pressed disabled:bg-control
          disabled:text-faint pointer-coarse:h-12 pointer-coarse:text-md">
        {busy ? 'Sending' : target ? 'Send' : 'Ask'}
      </button>
    </form>
  )
}
