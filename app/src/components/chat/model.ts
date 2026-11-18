// The Chat view's data: what chat.read sends (hpc_hub/agents/chat_view.py) turned into what the view draws. Every
// string here came from the cluster: it is shown as text, never as HTML.

export type ChatEvent =
  | { kind: 'user' | 'text' | 'command' | 'note'; id: string; text: string }
  | { kind: 'tool'; id: string; name: string; input: Record<string, unknown> }
  | { kind: 'result'; id: string; tool: string; text: string; error: boolean }

export type ReadAnswer = { waiting?: boolean; unknown?: boolean; file?: string; offset?: number; size?: number
  trimmed?: boolean; reset?: boolean; cwd?: string; events?: ChatEvent[] }

export type Ask = { question: string; detail: string; options: { key: string; label: string }[]; permission: boolean }
export type Screen = { busy: boolean; mode: Mode; ask: Ask | null; gone?: boolean }
export type Mode = 'ask' | 'edits' | 'plan' | 'auto'

export type DiffLine = { kind: 'same' | 'del' | 'add'; text: string }
export type Todo = { text: string; status: 'pending' | 'in_progress' | 'completed' }

export type Item =
  | { kind: 'user' | 'text' | 'command' | 'note'; id: string; text: string }
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

/** The events so far as the view's items: each tool call with its result folded into it. */
export function items(events: ChatEvent[], cwd = ''): Item[] {
  const out: Item[] = []
  const tools = new Map<string, Item & { kind: 'tool' }>()
  for (const e of events) {
    if (e.kind === 'tool') {
      const t = { kind: 'tool' as const, id: e.id, name: e.name, ...describe(e.name, e.input, cwd), result: null, error: false }
      tools.set(e.id, t)
      out.push(t)
    } else if (e.kind === 'result') {
      const t = tools.get(e.tool)
      if (t) { t.result = e.text; t.error = e.error }
    } else {
      out.push({ kind: e.kind, id: e.id, text: e.text })
    }
  }
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

/** **bold** and `code` inside a line, as pieces to draw. */
export function inline(text: string): { kind: 'plain' | 'bold' | 'code'; text: string }[] {
  const out: { kind: 'plain' | 'bold' | 'code'; text: string }[] = []
  const re = /(\*\*[^*\n]+\*\*|`[^`\n]+`)/g
  let at = 0
  for (const m of text.matchAll(re)) {
    if (m.index! > at) out.push({ kind: 'plain', text: text.slice(at, m.index) })
    const s = m[0]
    out.push(s.startsWith('**') ? { kind: 'bold', text: s.slice(2, -2) } : { kind: 'code', text: s.slice(1, -1) })
    at = m.index! + s.length
  }
  if (at < text.length) out.push({ kind: 'plain', text: text.slice(at) })
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
