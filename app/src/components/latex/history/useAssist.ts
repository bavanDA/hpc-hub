// The agent's help with a paper (Write message, Ask, Check my list) and its notes, for the whole project: jobs keep
// running while you edit, and their answers land in History. Every job asks for a compute node first and starts by
// itself once the node is there. The agent never commits and never checks a note off: you do.
import { useCallback, useEffect, useRef, useState } from 'react'

import { useEvent } from '../../../hooks'
import { call } from '../../../rpc'
import type { About, AgentChoice, AgentEvent, AgentKind, AgentPick, AgentStarted, Answer, Checked, Note,
  NoteList, NotePlace, Written } from '../../../types/history'
import { useToast } from '../../toast'
import { lastLine, plural, type Where } from './bits'

/** Where an ask's thread shows: scope is the History selection (c:<hash>, r:<from>..<to>, now, card) and anchor a
 *  row of the diff (path#n12, path#o12) or "top" (under the header). */
export type AskMeta = { question: string; about: About; scope: string; anchor: string; title: string }

export type Job = {
  id: string
  kind: AgentKind
  label: string
  node: string
  started: number  // Date.now()
  stage: 'starting' | 'preparing' | 'running' | 'done' | 'failed' | 'cancelled'
  error: string
  seconds: number
  about?: AgentEvent['about']
  result?: unknown
  ask?: AskMeta
}

type Args = {
  where: Where
  clusterName: string
  guard: (detail: string, run: () => void) => void  // a compute node first; runs by itself once it is there
  waiting: boolean  // a guarded job waits for its node now
  inHistory: boolean
  showHistory: () => void
}

export const FEATURE: Record<AgentKind, string> = { write: 'Write message', ask: 'Ask', check: 'Check my list' }

export function useAssist(a: Args) {
  const toast = useToast()
  const { where } = a
  const [choice, setChoice] = useState<AgentChoice | null>(null)
  const [installed, setInstalled] = useState<string[] | null>(null)
  const [jobs, setJobsState] = useState<Job[]>([])
  const jobsNow = useRef<Job[]>([])
  const setJobs = (fn: (js: Job[]) => Job[]) => { jobsNow.current = fn(jobsNow.current); setJobsState(jobsNow.current) }
  const [queued, setQueued] = useState<AgentKind | ''>('')
  const [notes, setNotes] = useState<NoteList | null>(null)
  const [draft, setDraft] = useState<{ job: Job; result: Written; n: number } | null>(null)
  const [checked, setChecked] = useState<{ job: Job; result: Checked } | null>(null)
  const early = useRef(new Map<string, AgentEvent>())  // events that came before the call answered
  const latest = useRef(a)
  latest.current = a

  useEffect(() => { call<AgentChoice>('latex.agent_choice').then(setChoice).catch(() => {}) }, [])
  const loadInstalled = useCallback(() => {
    if (installed === null) call<string[]>('tools.installed', { cluster: where.cluster }).then(setInstalled).catch(() => {})
  }, [installed, where.cluster])

  const choose = async (p: Partial<AgentPick> & { split?: boolean }) => {
    if (!choice) return
    const next = { agent: p.agent ?? choice.agent, model: p.model ?? choice.model, effort: p.effort ?? choice.effort,
      split: p.split ?? choice.split }
    try { setChoice(await call<AgentChoice>('latex.agent_choose', next)) } catch (e) {
      toast(lastLine((e as Error).message), { kind: 'error' })
    }
  }

  // -- notes ------------------------------------------------------------------------------------------------------
  const loadNotes = useCallback(() => {
    call<NoteList>('latex.notes', where).then(setNotes).catch(() => setNotes((n) => n ?? { notes: [], user: '', root: '' }))
  }, [where])
  useEffect(loadNotes, [loadNotes])
  const addNote = async (text: string, place: NotePlace | null = null) => {
    try {
      const n = await call<Note>('latex.note_add', { ...where, text, place })
      setNotes((l) => l && { ...l, notes: [...l.notes, n] })
      toast('Note added')
      return n
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }); return null }
  }
  const setNote = async (id: string, change: { text?: string; done?: boolean }) => {
    setNotes((l) => l && { ...l, notes: l.notes.map((n) => n.id === id ? { ...n, ...change } : n) })
    try {
      const n = await call<Note>('latex.note_set', { ...where, id, ...change })
      setNotes((l) => l && { ...l, notes: l.notes.map((x) => x.id === id ? n : x) })
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }); loadNotes() }
  }
  const removeNote = async (id: string) => {
    setNotes((l) => l && { ...l, notes: l.notes.filter((n) => n.id !== id) })
    try { await call('latex.note_delete', { ...where, id }) } catch (e) {
      toast(lastLine((e as Error).message), { kind: 'error' })
      loadNotes()
    }
  }

  // -- jobs -------------------------------------------------------------------------------------------------------
  const apply = (j: Job, e: AgentEvent): Job => ({ ...j, label: e.label || j.label, node: e.node || j.node,
    seconds: e.seconds, about: e.about ?? j.about,
    stage: e.done ? (e.cancelled ? 'cancelled' : e.ok ? 'done' : 'failed') : e.stage ?? j.stage,
    error: e.error ?? '', result: e.result ?? j.result })

  const ended = (j: Job) => {
    const t = latest.current
    if (j.stage === 'failed') {
      toast(`${FEATURE[j.kind]} did not work: ${lastLine(j.error)}`, { kind: 'error' })
      return
    }
    if (j.stage !== 'done') return
    const seconds = Math.max(1, Math.round((Date.now() - j.started) / 1000))
    if (j.kind === 'write') {
      setDraft((d) => ({ job: { ...j, seconds }, result: j.result as Written, n: (d?.n ?? 0) + 1 }))
      if (!t.inHistory) toast('Your commit message is ready to check', { action: { label: 'Open History', run: t.showHistory } })
    } else if (j.kind === 'check') {
      setChecked({ job: { ...j, seconds }, result: j.result as Checked })
      if (!t.inHistory) toast(`Checked ${plural((j.result as Checked).checked, 'note')}`, { action: { label: 'Open History', run: t.showHistory } })
    } else if (!t.inHistory && j.ask?.scope !== 'card') {
      toast(`${j.label.split(',')[0]} answered: ${(j.result as Answer).question}`, { action: { label: 'Open History', run: t.showHistory } })
    }
  }

  useEvent<AgentEvent>('latex-agent', (e) => {
    if (e.folder !== where.folder || e.cluster !== where.cluster) return
    const j = jobsNow.current.find((x) => x.id === e.id)
    if (!j) { early.current.set(e.id, e); return }
    if (j.stage === 'cancelled') return
    const n = apply(j, e)
    setJobs((js) => js.map((x) => x.id === e.id ? n : x))
    if (e.done) ended(n)
  })

  const start = (kind: AgentKind, params: Record<string, unknown>, extra: Partial<Job> = {}, pick?: AgentPick) => {
    const agent = choice?.agents.find((x) => x.id === (pick ?? choice)?.agent)?.name ?? 'The agent'
    const detail = `${FEATURE[kind]} runs ${agent} on a compute node on ${a.clusterName}. Once the node is ready, it `
      + 'starts by itself.'
    setQueued(kind)
    latest.current.guard(detail, () => {
      setQueued('')
      call<AgentStarted>(`latex.agent_${kind}`, { ...where, ...params, ...(pick ? { choice: pick } : {}) })
        .then((s) => {
          let job: Job = { id: s.id, kind, label: s.label, node: s.node, started: Date.now(), stage: 'starting', error: '',
            seconds: 0, ...extra }
          const e = early.current.get(s.id)
          if (e) { early.current.delete(s.id); job = apply(job, e) }
          setJobs((js) => [...js.filter((j) => kind === 'ask' || j.kind !== kind), job])
          if (e?.done) ended(job)
        })
        .catch((err: Error) => toast(`${FEATURE[kind]} did not start: ${lastLine(err.message)}`, { kind: 'error' }))
    })
  }

  const write = () => {
    if (!choice) return
    start('write', { split: choice.split })
  }
  const ask = (meta: AskMeta, pick?: AgentPick) => start('ask', { question: meta.question, about: meta.about },
    { ask: meta }, pick)
  const check = () => start('check', {})
  const cancel = (id: string) => {
    setJobs((js) => js.map((j) => j.id === id ? { ...j, stage: 'cancelled' } : j))
    call('latex.agent_cancel', { id }).catch(() => {})
  }
  const forget = (id: string) => setJobs((js) => js.filter((j) => j.id !== id))

  const running = (kind: AgentKind) => jobs.find((j) => j.kind === kind && ['starting', 'preparing', 'running'].includes(j.stage))
  return {
    choice, choose, installed, loadInstalled,
    jobs, running, waitingFor: queued && a.waiting ? queued : '',
    write, ask, check, cancel, forget,
    draft, clearDraft: () => setDraft(null), checked, clearChecked: () => setChecked(null),
    notes, loadNotes, addNote, setNote, removeNote,
  }
}

export type Assist = ReturnType<typeof useAssist>

/** 'Haiku · Low' for the chip, 'Claude' when there is nothing to pick. */
export function chipLabel(c: AgentPick, agents: AgentChoice['agents']): string {
  const a = agents.find((x) => x.id === c.agent)
  const model = a?.models.find(([v]) => v === c.model)?.[1]
  const effort = a?.efforts.find(([v]) => v === c.effort)?.[1]
  return [model && c.model ? model : a?.name ?? c.agent, effort && c.effort ? effort : ''].filter(Boolean).join(' · ')
}

/** 'Claude Haiku' for 'Claude Haiku, Low'. */
export const shortLabel = (label: string) => label.split(',')[0]
