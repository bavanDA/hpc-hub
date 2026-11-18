// The Chat view of a Claude tab: the conversation, the tool cards, what Claude asks, and a box to write to it. The
// terminal stays underneath, untouched; this only reads Claude's file and types into its session.
import { Check, ChevronDown, FileText, ListTodo, Pencil, Search, SquareTerminal, Wrench } from 'lucide-react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { splitHits } from '../reader/hits'
import { TextFind } from '../reader/TextFind'
import { useToast } from '../useToast'
import type { Tab } from '../terminals/tabs'
import { blocks, COMMANDS, EFFORTS, inline, items, MODELS, MODES, needsTerminal, toolHolds, type Item, type Mode } from './model'
import { useChat } from './useChat'

type Tool = Extract<Item, { kind: 'tool' }>

// Ctrl+F: what you look for, marked wherever the chat draws text (never by changing the page afterwards)
const Find = createContext('')

/** Text with what you look for marked. */
function Hl({ text }: { text: string }) {
  const q = useContext(Find)
  if (!q) return <>{text}</>
  return <>{splitHits(text, q).map((part, k) => k % 2
    ? <mark key={k} className="chat-hit rounded-[2px] bg-[rgb(229_165_10/0.4)] text-inherit data-[on]:bg-[rgb(230_97_0/0.6)]">{part}</mark>
    : part)}</>
}

/** **bold** and `code` in a line of text (always as text, never as HTML). */
function Inline({ text }: { text: string }) {
  return <>{inline(text).map((p, j) => p.kind === 'bold'
    ? <b key={j}><Hl text={p.text} /></b>
    : p.kind === 'code' ? <code key={j} className="rounded bg-inset px-1 font-mono text-[13px]"><Hl text={p.text} /></code>
      : <span key={j}><Hl text={p.text} /></span>)}</>
}

function Prose({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2 leading-[1.6]">
      {blocks(text).map((b, i) => b.code
        ? <pre key={i} className="overflow-x-auto rounded-lg bg-inset px-3 py-2 font-mono text-[13px]"><Hl text={b.text} /></pre>
        : b.table
          ? <div key={i} className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full border-collapse text-sm">
                <thead><tr>{b.table.head.map((c, j) => (
                  <th key={j} className="border-b border-line bg-inset px-3 py-1.5 text-left font-semibold"><Inline text={c} /></th>))}</tr></thead>
                <tbody>{b.table.rows.map((r, k) => (
                  <tr key={k} className="border-b border-line last:border-b-0">{r.map((c, j) => (
                    <td key={j} className="px-3 py-1.5 align-top"><Inline text={c} /></td>))}</tr>))}</tbody>
              </table>
            </div>
          : b.heading
            ? <div key={i} className={`font-semibold ${b.heading <= 2 ? 'text-base' : 'text-sm'} mt-1`}><Inline text={b.text} /></div>
            : <p key={i} className="m-0 whitespace-pre-wrap"><Inline text={b.text} /></p>)}
    </div>
  )
}

const ICON: Record<string, typeof FileText> = { Read: FileText, Edit: Pencil, MultiEdit: Pencil, Write: Pencil,
  Bash: SquareTerminal, Grep: Search, Glob: Search, TodoWrite: ListTodo }

function ToolCard({ t }: { t: Tool }) {
  const [open, setOpen] = useState(false)
  const Icon = ICON[t.name] ?? Wrench
  if (t.todos) {
    return (
      <div className="rounded-xl border border-line bg-card px-4 py-3 text-sm">
        <div className="mb-1 text-xs font-semibold text-dim">To do</div>
        {t.todos.map((todo, i) => (
          <div key={i} className={`flex items-center gap-2 py-0.5 ${todo.status === 'completed' ? 'text-dim line-through' : ''}`}>
            {todo.status === 'completed' ? <Check size={14} className="text-ok" />
              : <span className={`size-3 rounded-full border-2 ${todo.status === 'in_progress' ? 'border-accent' : 'border-line-strong'}`} />}
            {todo.text}
          </div>
        ))}
      </div>
    )
  }
  const body = t.diff || t.result !== null || t.detail
  const q = useContext(Find)
  const shown = open || (!!q && toolHolds(t, q))
  return (
    <div className={`overflow-hidden rounded-xl border bg-card ${t.error ? 'border-bad/50' : 'border-line'}`}>
      <button onClick={() => setOpen(!shown)} aria-expanded={shown} disabled={!body}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-hover disabled:hover:bg-transparent">
        <Icon size={15} className="shrink-0 text-dim" />
        <b className="shrink-0 font-semibold">{t.verb}</b>
        <span className="min-w-0 truncate font-mono text-[12.5px] text-dim"><Hl text={t.target} /></span>
        <span className="flex-1" />
        {t.error && <span className="text-xs text-bad">failed</span>}
        {t.result === null && !t.error && <span className="text-xs text-dim">running</span>}
        {body && <ChevronDown size={14} className={`shrink-0 text-dim transition-transform ${shown ? 'rotate-180' : ''}`} />}
      </button>
      {shown && (
        <div className="border-t border-line">
          {t.detail && <div className="px-4 py-2 text-sm text-dim"><Hl text={t.detail} /></div>}
          {t.diff && (
            <div className="overflow-x-auto font-mono text-[12.5px] leading-5">
              {t.diff.map((d, i) => (
                <div key={i} className={`px-4 whitespace-pre ${d.kind === 'del' ? 'bg-bad-bg text-bad'
                  : d.kind === 'add' ? 'bg-ok-bg text-ok' : 'text-dim'}`}>
                  {d.kind === 'del' ? '− ' : d.kind === 'add' ? '+ ' : '  '}<Hl text={d.text} /></div>
              ))}
            </div>
          )}
          {t.result !== null && t.result.trim() && (
            <pre className="m-0 max-h-80 overflow-auto px-4 py-2 font-mono text-[12.5px] leading-5 text-dim"><Hl text={t.result} /></pre>
          )}
        </div>
      )}
    </div>
  )
}

function Menu<T extends string>({ label, value, choices, onPick, note }: { label: string; value: string
  choices: { value: T; label: string; note: string }[]; onPick: (v: T) => void; note: string }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open])
  const shown = choices.find((c) => c.value === value)?.label ?? 'As started'
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-sm hover:bg-hover">
        <span className="text-dim">{label}</span><b className="font-semibold">{shown}</b><ChevronDown size={12} />
      </button>
      {open && (
        <div role="menu" aria-label={label}
          className="menu-in absolute top-9 left-0 z-30 w-64 rounded-xl bg-raised p-1.5 shadow-[var(--shadow-menu)]">
          {choices.map((c) => (
            <button key={c.value} role="menuitem" onClick={() => { setOpen(false); onPick(c.value) }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-hover
                ${c.value === value ? 'bg-hover' : ''}`}>
              <span><b className="block font-semibold">{c.label}</b><span className="text-xs text-dim">{c.note}</span></span>
              {c.value === value && <Check size={14} className="text-accent" />}
            </button>
          ))}
          <div className="mt-1 border-t border-line px-2.5 pt-2 pb-1 text-xs text-dim">{note}</div>
        </div>
      )}
    </div>
  )
}

export function ChatView({ tab, shown, title, toggle, onTerminal }: { tab: Tab; shown: boolean
  title: ReactNode; toggle: ReactNode; onTerminal: () => void }) {
  const toast = useToast()
  const { state, send, key, mode } = useChat(tab, shown)
  const [draft, setDraft] = useState('')
  const [slash, setSlash] = useState(false)
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const atEnd = useRef(true)
  const [finding, setFinding] = useState(false)
  const [query, setQuery] = useState('')
  const [hit, setHit] = useState({ n: 0, total: 0 })
  const findBox = useRef<HTMLInputElement>(null)
  const q = finding ? query.trim() : ''
  const openFind = () => { setFinding(true); requestAnimationFrame(() => { findBox.current?.focus(); findBox.current?.select() }) }
  const closeFind = () => { setFinding(false); setQuery('') }
  const step = (back: boolean) => setHit((h) => h.total ? { ...h, n: (h.n + (back ? h.total - 1 : 1)) % h.total } : h)
  const shownItems = items(state.events, state.cwd)
  const screen = state.screen
  const ask = screen?.ask ?? null

  // Ctrl+F (⌘F on a Mac) while the chat shows: find in the conversation
  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown])
  // the marks the chat drew: count them, mark the current one, bring it into view
  useEffect(() => {
    const marks = [...(list.current?.querySelectorAll<HTMLElement>('mark.chat-hit') ?? [])]
    setHit((h) => (h.total === marks.length && h.n < Math.max(marks.length, 1)) ? h : { n: 0, total: marks.length })
  }, [q, state.events.length])
  useEffect(() => {
    const marks = [...(list.current?.querySelectorAll<HTMLElement>('mark.chat-hit') ?? [])]
    marks.forEach((m, k) => { if (k === hit.n) m.dataset.on = '1'; else delete m.dataset.on })
    if (q && marks[hit.n]) { atEnd.current = false; marks[hit.n].scrollIntoView({ block: 'center' }) }
  }, [hit, q])

  useLayoutEffect(() => {  // follow the end while you are at it
    const el = list.current
    if (el && atEnd.current) el.scrollTop = el.scrollHeight
  }, [shownItems.length, ask])

  const fail = (e: Error) => toast(e.message, { kind: 'error' })
  const submit = (text = draft) => {
    const t = text.trim()
    if (!t) return
    if (needsTerminal(t)) {
      void send(t).then(onTerminal).catch(fail)
      toast('That command opens a menu: answer it in the terminal')
    } else {
      void send(t).catch(fail)
    }
    setDraft('')
    atEnd.current = true
  }
  const command = (c: string) => { setSlash(false); if (c === '/model' || c === '/effort') setDraft(c + ' '); else submit(c) }

  return (
    <Find.Provider value={q}>
    <div className="absolute inset-0 z-[6] flex flex-col bg-view">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-4 py-2">
        {toggle}
        {title}
        <span className="flex-1" />
        <Menu label="Model" value={model} choices={MODELS} note="Sends /model to Claude."
          onPick={(v) => { setModel(v); send(`/model ${v}`).catch(fail) }} />
        <Menu label="Effort" value={effort} choices={EFFORTS} note="Sends /effort to Claude."
          onPick={(v) => { setEffort(v); send(`/effort ${v}`).catch(fail) }} />
        <div role="group" aria-label="Permission mode" className="flex rounded-lg border border-line-strong p-0.5">
          {MODES.map((m) => (
            <button key={m.value} title={m.note} aria-pressed={screen?.mode === m.value}
              onClick={() => mode(m.value as Mode).catch(fail)}
              className={`h-7 rounded-md px-2.5 text-sm ${screen?.mode === m.value ? 'bg-selected font-semibold' : 'text-dim hover:bg-hover'}`}>
              {m.label}</button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
      {finding && <TextFind input={findBox} query={query} hit={hit} onQuery={setQuery} onStep={step} onClose={closeFind} />}
      <div ref={list} className="h-full overflow-y-auto"
        onScroll={(e) => { const el = e.currentTarget; atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80 }}>
        <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3.5 px-6 pt-5 pb-3">
          {state.unknown && (
            <div className="rounded-xl border border-line bg-card p-4 text-sm">
              This chat started before HPC Hub could follow it, so it shows only in the terminal. Chats you start or
              resume from now on show here.
              <div className="mt-3"><button onClick={onTerminal} className="h-8 rounded-lg border border-line-strong px-3 hover:bg-hover">Open the terminal</button></div>
            </div>
          )}
          {state.waiting && !state.unknown && <div className="py-10 text-center text-sm text-dim">Waiting for Claude to start…</div>}
          {state.trimmed && <div className="text-center text-xs text-dim">Earlier messages are in the terminal</div>}
          {shownItems.map((it) => {
            if (it.kind === 'tool') return <ToolCard key={it.id} t={it} />
            if (it.kind === 'user') {
              return <div key={it.id} className="max-w-[78%] self-end rounded-2xl bg-control px-4 py-2.5 whitespace-pre-wrap"><Hl text={it.text} /></div>
            }
            if (it.kind === 'command') {
              return <div key={it.id} className="self-end font-mono text-sm text-dim"><Hl text={it.text} /></div>
            }
            if (it.kind === 'note') return <div key={it.id} className="text-center text-xs whitespace-pre-wrap text-dim"><Hl text={it.text} /></div>
            return <Prose key={it.id} text={it.text} />
          })}
          {ask && (
            <div className={`flex flex-col gap-2.5 rounded-xl border p-3.5 ${ask.permission ? 'border-warn/50 bg-warn-bg' : 'border-accent/40 bg-accent-soft'}`}>
              <div className="font-semibold">{ask.question}</div>
              {ask.detail && <pre className="m-0 max-h-40 overflow-auto rounded-lg bg-inset px-3 py-2 font-mono text-[12.5px]">{ask.detail}</pre>}
              <div className="flex flex-col gap-1.5">
                {ask.options.map((o) => (
                  <button key={o.key} onClick={() => key(o.key).catch(fail)}
                    className="rounded-lg border border-line-strong bg-window px-3 py-2 text-left text-sm hover:bg-hover">
                    {/^\d$/.test(o.key) && <span className="mr-2 text-dim">{o.key}</span>}{o.label}</button>
                ))}
              </div>
              <button onClick={onTerminal} className="self-start text-sm text-dim underline hover:text-text">Open in terminal</button>
            </div>
          )}
          {screen?.busy && (
            <div className="flex items-center gap-2 text-sm text-dim">
              <span className="size-2 animate-pulse rounded-full bg-[var(--color-orange)]" />Claude is working
              <button onClick={() => key('escape').catch(fail)} className="ml-2 rounded-md border border-line-strong px-2 py-0.5 text-xs hover:bg-hover">Stop</button>
            </div>
          )}
          {state.error && <div className="text-sm text-bad">{state.error}</div>}
        </div>
      </div>
      </div>

      <div className="shrink-0 px-6 pb-4">
        <div className="relative mx-auto w-full max-w-[820px]">
          {slash && (
            <div role="menu" aria-label="Commands"
              className="menu-in absolute bottom-full left-0 z-30 mb-2 w-96 rounded-xl bg-raised p-1.5 shadow-[var(--shadow-menu)]">
              {COMMANDS.map((c) => (
                <button key={c.name} role="menuitem" onClick={() => command(c.name)}
                  className="flex w-full items-baseline gap-3 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-hover">
                  <span className="w-20 shrink-0 font-mono text-accent-text">{c.name}</span><span className="text-dim">{c.note}</span>
                </button>
              ))}
              <div className="mt-1 border-t border-line px-2.5 pt-2 pb-1 text-xs text-dim">Others open the terminal for that step.</div>
            </div>
          )}
          <div className="flex flex-col gap-2 rounded-2xl border border-line-strong bg-window px-3 py-2.5">
            <label htmlFor={`msg-${tab.key}`} className="sr-only">Message Claude</label>
            <textarea id={`msg-${tab.key}`} rows={2} value={draft} placeholder="Message Claude"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit() } }}
              className="resize-none bg-transparent leading-[21px] outline-none placeholder:text-faint" />
            <div className="flex items-center gap-1.5">
              <button onClick={() => setSlash(!slash)} aria-label="Commands" aria-expanded={slash}
                className="h-7 min-w-7 rounded-md border border-line-strong px-2 font-mono text-dim hover:bg-hover">/</button>
              <span className="flex-1" />
              <span className="text-xs text-dim">Enter sends · Shift+Enter new line</span>
              <button onClick={() => submit()} disabled={!draft.trim()}
                className="h-7 rounded-md bg-accent px-3 text-sm font-semibold text-on-accent disabled:opacity-40">Send</button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </Find.Provider>
  )
}
