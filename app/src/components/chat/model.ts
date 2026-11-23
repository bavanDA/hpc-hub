// The Chat view's data: what chat.read sends (hpc_hub/agents/chat_view.py) turned into what the view draws. Every
// string here came from the cluster: it is shown as text, never as HTML.

// line: the conversation line it came from (links say which line came before which: see onBranch in state.ts)
export type ChatEvent = (
  | { kind: 'user' | 'text' | 'command' | 'note'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; input: Record<string, unknown> }
  | { kind: 'result'; id: string; tool: string; text: string; error: boolean }) & { line?: string }

export type ReadAnswer = { waiting?: boolean; unknown?: boolean; file?: string; offset?: number; size?: number
  trimmed?: boolean; reset?: boolean; cwd?: string; events?: ChatEvent[]; links?: [string, string][] }

export type Ask = { question: string; detail: string; options: { key: string; label: string }[]; permission: boolean }
export type Screen = { busy: boolean; mode: Mode; ask: Ask | null; gone?: boolean
  ready?: boolean  // false while Claude is starting: no input box yet
  box?: boolean  // Claude's input box shows (no question or menu in its place)
  draft?: string }  // what is in that box, not sent: a message Claude gave back when stopped, or one gone back to

/** Claude is still starting: nothing to answer or switch yet (2026-11-20 report: nothing said so). */
export const starting = (s: Screen | null) => !!s && s.ready === false && !s.ask && !s.gone
export type Mode = 'ask' | 'edits' | 'plan' | 'auto'

export type DiffLine = { kind: 'same' | 'del' | 'add'; text: string }
export type Todo = { text: string; status: 'pending' | 'in_progress' | 'completed' }

export type Item =
  | { kind: 'user' | 'text' | 'command' | 'note'; id: string; text: string
      again?: boolean }  // yours, stopped before Claude answered and sent again just below
  | { kind: 'tool'; id: string; name: string; verb: string; target: string; detail: string
      diff: DiffLine[] | null; todos: Todo[] | null; result: string | null; error: boolean }

const str = (v: unknown) => typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v)

/** A path as short as it stays clear: inside the chat's folder, relative to it. */
export function shortPath(path: string, cwd = ''): string {
  if (cwd && path.startsWith(cwd.replace(/\/$/, '') + '/')) return path.slice(cwd.replace(/\/$/, '').length + 1)
  return path
}

/** Lines removed, then added: Claude's edits as a before and after. */
export function diff(before: string, after: string): DiffLine[] {
  const a = before.split('\n'), b = after.split('\n')
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length, endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  return [
    ...a.slice(Math.max(0, start - 2), start).map((text) => ({ kind: 'same' as const, text })),
    ...a.slice(start, endA).map((text) => ({ kind: 'del' as const, text })),
    ...b.slice(start, endB).map((text) => ({ kind: 'add' as const, text })),
    ...a.slice(endA, endA + 2).map((text) => ({ kind: 'same' as const, text })),
  ]
}

/** How a tool call reads in a card: its verb, what it worked on, and a line more. */
export function describe(name: string, input: Record<string, unknown>, cwd = ''):
  { verb: string; target: string; detail: string; diff: DiffLine[] | null; todos: Todo[] | null } {
  const path = shortPath(str(input.file_path ?? input.notebook_path ?? input.path), cwd)
  const plain = { detail: '', diff: null, todos: null }
  switch (name) {
    case 'Read': return { ...plain, verb: 'Read', target: path }
    case 'Write': {
      const lines = str(input.content).split('\n')
      return { ...plain, verb: 'Wrote', target: path, detail: `${lines.length} lines`,
        diff: lines.slice(0, 40).map((text) => ({ kind: 'add' as const, text })) }
    }
    case 'Edit': return { ...plain, verb: 'Edited', target: path, diff: diff(str(input.old_string), str(input.new_string)) }
    case 'MultiEdit': {
      const edits = Array.isArray(input.edits) ? input.edits as Record<string, unknown>[] : []
      return { ...plain, verb: 'Edited', target: path, detail: `${edits.length} changes`,
        diff: edits.flatMap((e) => diff(str(e.old_string), str(e.new_string))) }
    }
    case 'Bash': return { ...plain, verb: 'Ran', target: str(input.command).split('\n')[0], detail: str(input.description) }
    case 'Grep': return { ...plain, verb: 'Searched for', target: str(input.pattern), detail: path }
    case 'Glob': return { ...plain, verb: 'Looked for', target: str(input.pattern), detail: path }
    case 'WebFetch': return { ...plain, verb: 'Read', target: str(input.url) }
    case 'WebSearch': return { ...plain, verb: 'Searched the web for', target: str(input.query) }
    case 'Task': case 'Agent': return { ...plain, verb: 'Asked a helper', target: str(input.description) }
    case 'TodoWrite': {
      const todos = (Array.isArray(input.todos) ? input.todos : []) as Record<string, unknown>[]
      return { ...plain, verb: 'To do', target: '', todos: todos.map((t) => ({ text: str(t.content),
        status: (['pending', 'in_progress', 'completed'].includes(str(t.status)) ? t.status : 'pending') as Todo['status'] })) }
    }
    default: return { ...plain, verb: name.replace(/^mcp__\w+__/, ''), target: '', detail: JSON.stringify(input).slice(0, 300) }
  }
}

/** The events so far as the view's items: each tool call with its result folded into it. With draft (what sits in
 * Claude's input box), a last message of yours with the same text is left out: Claude gave it back, unsent. With
 * links (line -> the line it hangs from), a message of yours followed by another from the same line, nothing from
 * Claude between, is marked again: stopped before an answer and sent again, edited or run into the next. Nothing is
 * ever left out for that (2026-11-22: Claude hangs lines off its bookkeeping too, so wider guesses lost messages). */
export function items(events: ChatEvent[], cwd = '', draft = '', links: Record<string, string> = {}): Item[] {
  const out: Item[] = []
  const tools = new Map<string, Item & { kind: 'tool' }>()
  let mine: (Item & { kind: 'user' }) | null = null  // your last message, while nothing from Claude came after it
  let mineLine = ''
  for (const e of events) {
    if (e.kind === 'user') {
      const from = e.line ? links[e.line] : undefined
      if (mine && from !== undefined && links[mineLine] === from) mine.again = true
    }
    if (e.kind === 'tool') {
      const t = { kind: 'tool' as const, id: e.id, name: e.name, ...describe(e.name, e.input, cwd), result: null, error: false }
      tools.set(e.id, t)
      out.push(t)
    } else if (e.kind === 'result') {
      const t = tools.get(e.tool)
      if (t) { t.result = e.text; t.error = e.error }
    } else {
      const item = { kind: e.kind, id: e.id, text: e.text }
      out.push(item)
      if (e.kind === 'user') { mine = item as Item & { kind: 'user' }; mineLine = e.line ?? ''; continue }
    }
    if (e.kind !== 'note') mine = null
  }
  const last = out.at(-1)
  if (draft.trim() && last?.kind === 'user' && last.text.trim() === draft.trim()) out.pop()
  return out
}

export type Block = { code: boolean; text: string; table?: { head: string[]; rows: string[][] }; heading?: number }

const ROW = /^\s*\|.*\|\s*$/
const RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const HEADING = /^(#{1,4})\s+(.+?)\s*#*\s*$/

/** A table row's cells: "| a | `b|c` |" is ["a", "`b|c`"] (a | inside code or written \| stays in its cell). */
export function cells(line: string): string[] {
  const s = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const out: string[] = []
  let cur = '', code = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (ch === '\\' && s[i + 1] === '|') { cur += '|'; i++ } else if (ch === '`') { code = !code; cur += ch } else if (ch === '|' && !code) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  out.push(cur.trim())
  return out
}

/** Plain text as paragraphs, headings (# to ####) and tables (a header row, a --- rule, then rows). */
function prose(text: string): Block[] {
  const out: Block[] = []
  const lines = text.split('\n')
  let para: string[] = []
  const flush = () => { if (para.join('\n').trim()) out.push({ code: false, text: para.join('\n').replace(/^\n+|\n+$/g, '') }); para = [] }
  for (let i = 0; i < lines.length; i++) {
    const h = HEADING.exec(lines[i])
    if (h) { flush(); out.push({ code: false, text: h[2], heading: h[1].length }); continue }
    if (ROW.test(lines[i]) && RULE.test(lines[i + 1] ?? '') && lines[i + 1].includes('-')) {
      flush()
      const head = cells(lines[i])
      const rows: string[][] = []
      i += 2
      while (i < lines.length && ROW.test(lines[i])) {
        const r = cells(lines[i])
        rows.push(head.map((_, k) => r[k] ?? ''))  // every row as wide as the header
        i++
      }
      i--
      out.push({ code: false, text: '', table: { head, rows } })
      continue
    }
    para.push(lines[i])
  }
  flush()
  return out
}

/** Text with ``` fences: code blocks, and the rest as paragraphs, headings and tables. */
export function blocks(text: string): Block[] {
  const out: Block[] = []
  const parts = text.split(/^```[^\n]*\n?/m)
  parts.forEach((p, i) => {
    if (!p.trim()) return
    if (i % 2 === 1) out.push({ code: true, text: p.replace(/\n$/, '') })
    else out.push(...prose(p))
  })
  return out
}

export type Piece = { kind: 'plain' | 'bold' | 'code'; text: string } | { kind: 'link'; text: string; url: string }

const TRAIL = /[.,;:!?'")\]}>]+$/  // sentence punctuation after a bare link is not part of it

/** **bold**, `code`, [text](https://…) and bare https:// links inside a line, as pieces to draw. */
export function inline(text: string): Piece[] {
  const out: Piece[] = []
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s<>`]+)/g
  let at = 0
  const plain = (s: string) => { if (s) { const last = out.at(-1); if (last?.kind === 'plain') last.text += s; else out.push({ kind: 'plain', text: s }) } }
  for (const m of text.matchAll(re)) {
    plain(text.slice(at, m.index))
    const s = m[0]
    if (s.startsWith('**')) out.push({ kind: 'bold', text: s.slice(2, -2) })
    else if (s.startsWith('`')) out.push({ kind: 'code', text: s.slice(1, -1) })
    else if (s.startsWith('[')) {
      const cut = s.indexOf('](')
      out.push({ kind: 'link', text: s.slice(1, cut), url: s.slice(cut + 2, -1) })
    } else {
      const url = s.replace(TRAIL, '')
      out.push({ kind: 'link', text: url, url })
      plain(s.slice(url.length))
    }
    at = m.index! + s.length
  }
  plain(text.slice(at))
  return out
}

export const MODELS = [
  { value: 'opus', label: 'Opus', note: 'Most capable, for hard problems' },
  { value: 'sonnet', label: 'Sonnet', note: 'Fast and strong, for most work' },
  { value: 'haiku', label: 'Haiku', note: 'Quickest, for small edits' },
]

export const EFFORTS = [
  { value: 'low', label: 'Low', note: 'Quick answers, least thinking' },
  { value: 'medium', label: 'Medium', note: 'Some thinking' },
  { value: 'high', label: 'High', note: 'Thinks things through' },
  { value: 'xhigh', label: 'Extra high', note: 'More thinking for hard tasks' },
  { value: 'max', label: 'Max', note: 'Most thinking, slowest' },
]

export const MODES: { value: Mode; label: string; note: string }[] = [
  { value: 'ask', label: 'Ask', note: 'Asks before edits and commands' },
  { value: 'edits', label: 'Edits', note: 'Edits files, asks before commands' },
  { value: 'plan', label: 'Plan', note: 'Reads and plans, changes nothing' },
  { value: 'auto', label: 'Auto', note: 'Goes ahead; asks only when a step looks risky' },
]

export const COMMANDS = [
  { name: '/compact', note: 'Shorten the conversation to free context', now: true },
  { name: '/clear', note: 'Start fresh in this session', now: true, newChat: true },
  { name: '/cost', note: 'What this session has used', now: true },
  { name: '/context', note: 'What fills the context', now: true },
  { name: '/model', note: 'Choose the model', now: false },
  { name: '/effort', note: 'Choose how hard Claude thinks', now: false },
]

/** A slash command HPC Hub can't show (it opens a menu in the terminal): the view switches to the terminal. */
export function needsTerminal(text: string): boolean {
  const cmd = text.trim().split(/\s+/)[0]
  if (!cmd.startsWith('/')) return false
  const known = COMMANDS.find((c) => c.name === cmd)
  if (!known) return true
  return !known.now && text.trim() === cmd  // /model alone opens its menu; /model opus does not
}

/** Ctrl+F: does a tool card hold what you look for in its folded part (so it opens by itself)? */
export function toolHolds(t: { detail?: string | null; result: string | null; diff?: { text: string }[] | null }, q: string): boolean {
  const low = q.trim().toLowerCase()
  if (!low) return false
  return [t.detail ?? '', t.result ?? '', ...(t.diff ?? []).map((d) => d.text)].some((x) => x.toLowerCase().includes(low))
}
