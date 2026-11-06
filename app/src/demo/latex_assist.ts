// Demo answers for the agent in the demo paper's History: background jobs with canned answers. Nothing runs anywhere.
import type { About, AgentChoice, AgentKind, AgentLevel, AgentPick, Changes, GitState, HCommit, Note, NotePlace,
  Verdict } from '../types/history'
import { demoEmit } from './events'
import { demoCall } from './index'

const FOLDER = '/home/jdoe/papers/sparse-downscaling'
const now = () => Math.floor(Date.now() / 1000)
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

const EFFORT: [string, string][] = [['', 'Default'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'],
  ['xhigh', 'Extra high'], ['max', 'Max']]
const AGENTS: AgentChoice['agents'] = [
  { id: 'claude', name: 'Claude', models: [['', 'Default'], ['opus', 'Opus'], ['sonnet', 'Sonnet'], ['haiku', 'Haiku']],
    efforts: EFFORT },
  { id: 'codex', name: 'ChatGPT', models: [], efforts: EFFORT.slice(0, 5) },
  { id: 'agy', name: 'Antigravity', models: [], efforts: EFFORT },
  { id: 'cursor', name: 'Cursor', models: [['', 'Default'], ['auto', 'Auto'], ['composer-2.5', 'Composer 2.5'],
    ['claude-opus-5-thinking-high', 'Claude Opus 5'], ['claude-sonnet-5-thinking-high', 'Claude Sonnet 5'],
    ['gpt-5.6-sol-high', 'GPT-5.6 Sol'], ['gemini-3.7-flash-high', 'Gemini 3.7 Flash']], efforts: [] },
]
const DEFAULT: AgentPick = { agent: 'claude', model: 'haiku', effort: 'low' }
let pick: AgentPick & { split: boolean } = { ...DEFAULT, split: true }

function label(p: AgentPick): string {
  const a = AGENTS.find((x) => x.id === p.agent)!
  const m = a.models.find(([v]) => v === p.model && v)?.[1], e = a.efforts.find(([v]) => v === p.effort && v)?.[1]
  return `${a.name}${m ? ` ${m}` : ''}${e ? `, ${e}` : ''}`
}
function choice(): AgentChoice {
  return { ...pick, label: label(pick), agents: AGENTS }
}

/** Another agent (Settings): what it has carries over, else Claude's Haiku, Low or the others' Default and Low
 *  (assist.switch). */
function switched(id: string): AgentPick {
  const a = AGENTS.find((x) => x.id === id)
  if (!a) throw new Error(`No agent ${id}`)
  if (a.id === pick.agent) return pick
  const start = a.id === 'claude' ? DEFAULT : { agent: a.id, model: '', effort: 'low' }
  const keep = (list: [string, string][], now: string, first: string) => now && list.some(([v]) => v === now) ? now
    : list.some(([v]) => v === first) ? first : ''
  return { agent: a.id, model: keep(a.models, pick.model, start.model), effort: keep(a.efforts, pick.effort, start.effort) }
}

const DAY = 86400
let n = 0
const note = (text: string, place: NotePlace | null, author: string, ago: number, done = false): Note =>
  ({ id: `note${++n}`, n, text, place, author, time: now() - ago, done, done_by: done ? author : '', done_at: done ? now() - ago / 2 : 0 })
const notes: Note[] = [
  note('Fix bib keys after the merge', { path: 'refs.bib', line: 1 }, 'mygroup', 15 * DAY, true),
  note('Say where the gains are largest, not only that there are gains', { path: 'sections/results.tex', line: 4 },
    'asmith', DAY + 3000),
  note('The workshop for lee2022 is called Workshop on Open Data', { path: 'refs.bib', line: 18 }, 'jdoe', 5 * DAY),
  note('Give the rainfall numbers per year in a small table', { page: 1, x: 420, y: 560 }, 'mygroup', 2 * DAY),
  note('Check the 5.4 hours against the run logs on Wulver', { path: 'sections/results.tex', line: 10 }, 'jdoe', 7000),
  note('Send the reply letter draft to mygroup', null, 'jdoe', 3000),
]

const running = new Map<string, { cancelled: boolean }>()

function job(kind: AgentKind, p: AgentPick, about: Record<string, unknown>, ms: number, answer: () => Promise<unknown>) {
  const id = Math.random().toString(16).slice(2, 14)
  const node = 'n0042', lbl = label(p), t0 = performance.now()
  const state = { cancelled: false }
  running.set(id, state)
  const emit = (extra: Record<string, unknown>) => demoEmit('latex-agent', { id, cluster: 'wulver', folder: FOLDER, kind,
    node, label: lbl, done: false, seconds: Math.round((performance.now() - t0) / 100) / 10, ...extra })
  void (async () => {
    await wait(80)
    emit({ stage: 'preparing' })
    await wait(600)
    if (state.cancelled) return emit({ done: true, ok: false, cancelled: true })
    emit({ stage: 'running', about })
    await wait(ms)
    running.delete(id)
    if (state.cancelled) return emit({ done: true, ok: false, cancelled: true })
    emit({ done: true, ok: true, result: await answer() })
  })()
  return { id, node, label: lbl, agent: p.agent }
}
const pickOf = (c?: AgentLevel | null): AgentPick => ({ ...pick, ...c })

async function written() {
  const st = await demoCall<GitState>('latex.git_state', {})
  const paths = st.changes.map((c) => c.path)
  const bib = paths.find((p) => p.endsWith('.bib')), tex = paths.find((p) => p.endsWith('.tex'))
  const commits = pick.split && bib && tex ? [
    { subject: 'Give the workshop for lee2022 its real name', body: 'It is the Workshop on Open Data, and the paper is out.',
      files: [bib] },
    { subject: 'Say where the gains are largest: near coasts and mountains', body: 'asmith asked where the model helps most.',
      files: paths.filter((p) => p !== bib) }] : []
  return { subject: 'Say where the gains are largest, and fix the workshop name',
    body: 'Near coasts and mountains the coarse grid hides the most, so that is where the model helps. The workshop '
      + 'for lee2022 now has its real name.', commits, files: st.changes, head: st.head }
}

async function answered(question: string, about: About) {
  let text: string
  if (about.kind === 'commit') {
    const c = (await demoCall<HCommit[]>('latex.git_log', {})).find((x) => x.hash === about.hash)
    const ch = await demoCall<Changes>('latex.git_changes', { to: about.hash })
    const f = ch.files[0], row = f?.hunks.flatMap((h) => h.rows).find((r) => r.k === '+')
    text = c?.short === 'a91c3e2'
      ? 'Because every run in the results used 0.1. The text said 0.01, so [[main.tex:47]] now matches the runs and the '
        + 'run logs. The loss in Equation (1) on [[page 1]] keeps lambda as a symbol, so nothing else had to change.'
      : `${c?.author ?? 'A co-author'} changed ${ch.files.length === 1 ? 'one file' : `${ch.files.length} files`}. The `
        + `main change is at [[${f?.path ?? 'main.tex'}:${row?.n ?? 1}]]${row ? `, which now reads "${row.t.trim().slice(0, 80)}"` : ''}. `
        + `The message gives the reason: ${(c?.body || c?.subject || '').replace(/\.$/, '')}.`
  } else if (about.kind === 'range') {
    text = 'Since then the paper got a results section, the training details moved up next to the method '
      + '([[main.tex:49-58]]), "site" became "station" everywhere, and the smoothness weight in [[main.tex:47]] was '
      + 'corrected to 0.1. The abstract also gives the 18% number now ([[main.tex:25]]).'
  } else if (about.kind === 'lines' || (about.kind === 'pdf' && about.path)) {
    const path = about.path ?? 'main.tex', line = about.line ?? 1
    text = /worse|read/i.test(question)
      ? `It reads a little heavier. [[${path}:${line}]] now carries two points: how much the error drops and where `
        + 'it drops most. Ending the sentence after "smooths away" and starting a new one with "The gains are largest" '
        + 'keeps both clear. On the PDF it is the paragraph at the top of [[page 2]].'
      : `[[${path}:${line}]] is there because a co-author asked for it in the reading session: it says where the model `
        + 'helps most, which the numbers in the list below back up. It matches the run logs mentioned in the commit '
        + 'that added it.'
  } else {
    text = 'This spot is the list of results. The numbers there come from the run logs; nothing in the text above '
      + 'contradicts them. See [[page 2]].'
  }
  return { text, cites: [], question }
}

function verdicts(): { checked: number; results: Verdict[] } {
  const open = notes.filter((x) => !x.done)
  const results = open.map((x): Verdict => /gains are largest/.test(x.text)
    ? { id: x.id, verdict: 'done', reason: 'The new sentence at [[sections/results.tex:4-5]] says it: near coasts and '
      + 'mountains.', path: 'sections/results.tex', line: 5 }
    : /workshop/i.test(x.text) ? { id: x.id, verdict: 'done', reason: '[[refs.bib:18]] now says Workshop on Open Data.',
      path: 'refs.bib', line: 18 }
    : /table/.test(x.text) ? { id: x.id, verdict: 'not_yet', reason: 'The rainfall result is still one line in the list at '
      + '[[sections/results.tex:9]]; no table was added.', path: 'sections/results.tex', line: 9 }
    : { id: x.id, verdict: 'unsure', reason: /5\.4/.test(x.text) ? 'The run logs are not in these changes.'
      : 'Nothing in the changes is about this.', path: '', line: 0 })
  return { checked: open.length, results }
}

export const answers: Record<string, unknown> = {
  'latex.agent_choice': () => choice(),
  'latex.agent_choose': (p: Partial<AgentPick> & { split?: boolean }) => {
    const now = p.agent ? switched(p.agent) : pick
    pick = { agent: now.agent, model: p.model ?? now.model, effort: p.effort ?? now.effort, split: p.split ?? pick.split }
    return choice()
  },
  'latex.agent_write': async ({ choice: c }: { choice?: AgentLevel }) => {
    const st = await demoCall<GitState>('latex.git_state', {})
    if (!st.changes.length) throw new Error('Nothing changed since your last commit')
    return job('write', pickOf(c), { files: st.changes.length, lines: st.changes.reduce((s, x) => s + x.added + x.removed, 0) },
      4200, written)
  },
  'latex.agent_ask': ({ question, about, choice: c }: { question: string; about: About; choice?: AgentLevel }) =>
    job('ask', pickOf(c), { title: about.kind }, c?.model === 'sonnet' ? 6500 : 3800, () => answered(question, about)),
  'latex.agent_check': ({ choice: c }: { choice?: AgentLevel }) => {
    if (!notes.some((x) => !x.done)) throw new Error('No open notes to check')
    return job('check', pickOf(c), { notes: notes.filter((x) => !x.done).length }, 5200, async () => verdicts())
  },
  'latex.agent_cancel': ({ id }: { id: string }) => {
    const r = running.get(id)
    if (r) r.cancelled = true
    return !!r
  },
  'latex.notes': () => ({ notes, user: 'jdoe', root: FOLDER }),
  'latex.note_add': ({ text, place }: { text: string; place: NotePlace | null }) => {
    if (!text.trim()) throw new Error('Write something first')
    const x = { ...note(text.trim(), place ?? null, 'jdoe', 0), n: Math.max(0, ...notes.map((y) => y.n)) + 1 }
    notes.push(x)
    return x
  },
  'latex.note_set': ({ id, text, done }: { id: string; text?: string; done?: boolean }) => {
    const x = notes.find((y) => y.id === id)
    if (!x) throw new Error('That note is gone')
    if (text !== undefined) x.text = text
    if (done !== undefined) Object.assign(x, { done, done_by: done ? 'jdoe' : '', done_at: done ? now() : 0 })
    return x
  },
  'latex.note_delete': ({ id }: { id: string }) => {
    const i = notes.findIndex((y) => y.id === id)
    if (i >= 0) notes.splice(i, 1)
    return null
  },
}
