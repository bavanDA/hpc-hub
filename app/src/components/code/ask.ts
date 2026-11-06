import { useSyncExternalStore } from 'react'

import { call } from '../../rpc'
import type { AskContext, AskKind, AskRequest, AskResult, AskState, AskStatus } from '../../types/code'
import { messageFor } from './agentMessage'
import { expectAgentChange } from './watch'

const POLL = 3000

/** What the user calls each agent. */
export const AGENT_NAMES: Record<string, string> = { claude: 'Claude', codex: 'ChatGPT', agy: 'Antigravity', cursor: 'Cursor' }
export const agentName = (agent: string) => AGENT_NAMES[agent] ?? agent
const DONE: AskState[] = ['done', 'failed', 'cancelled']

export type Ask = {
  cluster: string
  status: AskStatus
  result: AskResult | null  // once done and fetched
  error: string             // the last error talking to the cluster about it
  seen: boolean             // the user opened its result
}

type State = { asks: Ask[] }
let state: State = { asks: [] }
const subscribers = new Set<() => void>()
let timer: number | null = null

function changed(asks: Ask[]) {
  state = { asks }
  subscribers.forEach((fn) => fn())
  schedule()
}

function update(id: string, change: Partial<Ask>) {
  changed(state.asks.map((a) => (a.status.id === id ? { ...a, ...change } : a)))
}

export function useAsks(): State {
  return useSyncExternalStore((fn) => { subscribers.add(fn); return () => subscribers.delete(fn) }, () => state)
}

export const isRunning = (a: Ask) => !DONE.includes(a.status.state)
export const runningCount = () => state.asks.filter(isRunning).length
/** Finished asks whose result you haven't opened yet: worth a dot on the badge too. */
export const unseenCount = () => state.asks.filter((a) => !isRunning(a) && !a.seen).length
export const getAsk = (id: string) => state.asks.find((a) => a.status.id === id)

function schedule() {
  const any = state.asks.some(isRunning)
  if (any && timer === null) timer = window.setInterval(() => void poll(), POLL)
  if (!any && timer !== null) {
    clearInterval(timer)
    timer = null
  }
}

async function poll() {
  for (const a of state.asks.filter(isRunning)) {
    try {
      const status = await call<AskStatus>('code.ask_status', { cluster: a.cluster, id: a.status.id })
      update(a.status.id, { status, error: '' })
      if (status.state === 'done') void loadResult(a.status.id)
    } catch (e) {
      update(a.status.id, { error: (e as Error).message })
    }
  }
}

/** Starts an ask and answers its id. The first status shows right away, before the cluster answers. */
export async function startAsk(req: AskRequest): Promise<string> {
  const answer = await call<string | { id: string }>('code.ask_start', req)
  const id = typeof answer === 'string' ? answer : answer.id
  const status: AskStatus = { id, state: 'starting', kind: req.kind, agent: req.agent, path: req.path,
    started: Math.floor(Date.now() / 1000), detail: 'Starting' }
  changed([{ cluster: req.cluster, status, result: null, error: '', seen: false }, ...state.asks])
  return id
}

export async function cancelAsk(id: string): Promise<void> {
  const a = getAsk(id)
  if (!a) return
  await call('code.ask_cancel', { cluster: a.cluster, id })
  update(id, { status: { ...a.status, state: 'cancelled', detail: 'Stopped' } })
}

/** The agent's answer and proposed changes; fetched once and kept. */
export async function loadResult(id: string): Promise<AskResult | null> {
  const a = getAsk(id)
  if (!a) return null
  if (a.result) return a.result
  try {
    const result = await call<AskResult>('code.ask_result', { cluster: a.cluster, id })
    update(id, { result })
    return result
  } catch (e) {
    update(id, { error: (e as Error).message })
    return null
  }
}

export function markSeen(id: string) {
  update(id, { seen: true })
}

/** Picks up asks started earlier on a cluster (after the app restarted), newest first. */
export async function loadAsks(cluster: string): Promise<void> {
  const rows = await call<AskStatus[]>('code.asks', { cluster })
  const known = new Map(state.asks.map((a) => [a.status.id, a]))
  const fresh = rows.map((status) => known.get(status.id)
    ? { ...known.get(status.id)!, status }
    : { cluster, status, result: null, error: '', seen: DONE.includes(status.state) })
  const others = state.asks.filter((a) => a.cluster !== cluster)
  changed([...fresh, ...others].sort((x, y) => y.status.started - x.status.started))
}

export type RunningAgent = { cluster: string; session: string; node: string; agent: string; label: string }

/** Pastes the message into the agent's terminal and remembers the file, so its next change can be undone. */
export async function sendToAgent(target: RunningAgent, ctx: AskContext, kind: AskKind, question: string,
  errorText = '', fileKey?: string): Promise<void> {
  if (fileKey) expectAgentChange(fileKey, target.label || target.agent)
  await call('terminals.send', { cluster: target.cluster, session: target.session, node: target.node,
    text: messageFor(ctx, kind, question, errorText) })
}
