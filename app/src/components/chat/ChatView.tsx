// The Chat view of a Claude tab: the conversation, the tool cards, what Claude asks, and a box to write to it. The
// terminal stays underneath, untouched; this only reads Claude's file and types into its session.
import { ArrowDown, Check, ChevronDown, Copy, FileText, ListTodo, Pencil, Search, SquareTerminal, Wrench } from 'lucide-react'
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { copyText } from '../app/clipboard'
import { openLink } from '../app/openLink'
import { splitHits } from '../reader/hits'
import { TextFind } from '../reader/TextFind'
import { useToast } from '../useToast'
import type { Tab } from '../terminals/tabs'
import { arrive, rises, type Arrivals } from './arrivals'
import { isEcho, loadDraft, saveDraft, type Sent } from './draft'
import { blocks, COMMANDS, EFFORTS, inline, items, MODELS, MODES, needsTerminal, starting, toolHolds, type Item, type Mode } from './model'
import { pend, pendingNote, pends, settle, type Pending } from './pending'
import { useChat } from './useChat'

type Tool = Extract<Item, { kind: 'tool' }>

/** Less motion asked for: scrollTo's own smooth ignores the CSS that turns smooth scrolling off. */
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

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
  return <>{inline(text).map((p, j) => p.kind === 'link'
    ? <a key={j} href={p.url} title={p.url} onClick={(e) => { e.preventDefault(); void openLink(p.url) }}
        className="text-accent-text underline decoration-1 underline-offset-2 hover:decoration-2 [overflow-wrap:anywhere]"><Hl text={p.text} /></a>
    : p.kind === 'bold'
    ? <b key={j}><Hl text={p.text} /></b>
    : p.kind === 'code' ? <code key={j} className="rounded bg-inset px-1 font-mono text-[13px]"><Hl text={p.text} /></code>
      : <span key={j}><Hl text={p.text} /></span>)}</>
}

/** A small Copy button, shown when you point at what it copies. */
function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const toast = useToast()
  return (
    <button aria-label={label} title={label} onClick={() => copyText(text).then(() => toast('Copied')).catch((e: Error) => toast(e.message))}
      className="absolute top-1.5 right-1.5 hidden items-center gap-1 rounded-md border border-line-strong bg-window px-2 py-0.5
        text-xs text-dim group-hover:flex hover:text-text">
      <Copy size={12} />Copy</button>
  )
}

function Prose({ text, rise }: { text: string; rise: string }) {
  return (
    <div className={`group relative flex flex-col gap-2 pr-16 leading-[1.6]${rise}`}>
      <CopyButton text={text} label="Copy Claude's reply" />
      {blocks(text).map((b, i) => b.code
        ? <div key={i} className="group/code relative">
            <pre className="m-0 overflow-x-auto rounded-lg bg-inset px-3 py-2 font-mono text-[13px]"><Hl text={b.text} /></pre>
            <button aria-label="Copy the code" title="Copy the code" onClick={() => void copyText(b.text)}
              className="absolute top-1.5 right-1.5 hidden rounded-md border border-line-strong bg-window px-2 py-0.5 text-xs text-dim
                group-hover/code:block hover:text-text">Copy</button>
          </div>
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

function ToolCard({ t, rise }: { t: Tool; rise: string }) {
  const [open, setOpen] = useState(false)
  const q = useContext(Find)
  const Icon = ICON[t.name] ?? Wrench
  if (t.todos) {
    return (
      <div className={`rounded-xl border border-line bg-card px-4 py-3 text-sm${rise}`}>
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
  const shown = open || (!!q && toolHolds(t, q))
  return (
    <div className={`overflow-hidden rounded-xl border bg-card ${t.error ? 'border-bad/50' : 'border-line'}${rise}`}>
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
  const { state, send, key, stop, background, mode } = useChat(tab, shown)
  const [switching, setSwitching] = useState<Mode | null>(null)  // a mode switch on its way (a few presses)
  const [draft, setDraft] = useState(() => loadDraft(tab))  // what you typed comes back with the view
  const [slash, setSlash] = useState(false)
  const [model, setModel] = useState('')
  const [effort, setEffort] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const atEnd = useRef(true)  // following the end: what comes in scrolls into view
  const gliding = useRef(false)  // a smooth scroll of ours to the end, on its way: it never ends following
  const lastTop = useRef(0)
  const [below, setBelow] = useState(false)  // something new came below while you read further up
  const [finding, setFinding] = useState(false)
  const [query, setQuery] = useState('')
  const [hit, setHit] = useState({ n: 0, total: 0 })
  const findBox = useRef<HTMLInputElement>(null)
  const q = finding ? query.trim() : ''
  const openFind = () => { setFinding(true); requestAnimationFrame(() => { findBox.current?.focus(); findBox.current?.select() }) }
  const closeFind = () => { setFinding(false); setQuery('') }
  const step = (back: boolean) => setHit((h) => h.total ? { ...h, n: (h.n + (back ? h.total - 1 : 1)) % h.total } : h)
  const screen = state.screen
  // what sits unsent in Claude's input box: a message it gave back when you stopped it before it answered, or the
  // one you went back to. It comes into the box below to edit; sending replaces it (2026-11-22 report)
  // Not the message you just sent, on its way in (2026-11-24 report: it came back into the box once sent)
  const sent = useRef<Sent | null>(null)  // your last message, while Claude's box may still show it on its way
  const inBox = screen?.draft ?? ''
  const echo = isEcho(inBox, sent.current)
  const given = echo ? '' : inBox
  const shownItems = items(state.events, state.cwd, given, state.links)
  const took = useRef('')
  useEffect(() => {
    if (echo) { sent.current!.seen = true; return }
    if (!given) {
      took.current = ''
      if (sent.current?.seen) sent.current = null  // Enter took it: what shows there from now on is Claude's
      return
    }
    if (given === took.current) return
    took.current = given
    setDraft((d) => d.trim() ? d : given)
  }, [given, echo])
  useEffect(() => saveDraft(tab, draft), [tab, draft])
  const wait = starting(screen)  // Claude is still starting: say so, and nothing to switch yet
  const ask = screen?.ask ?? null

  // your message at once, dimmed until Claude's file has it (2026-11-24 report: sending looked like nothing happened)
  const [pending, setPending] = useState<Pending[]>([])
  const [now, setNow] = useState(() => Date.now())
  const sends = useRef(0)
  useEffect(() => {
    if (!pending.length) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [pending.length])
  const { left, took: inFile } = settle(pending, shownItems, given, now)
  useEffect(() => { if (left.length < pending.length) setPending(left) }, [left.length, pending.length])  // eslint-disable-line react-hooks/exhaustive-deps
  const swapped = useRef(new Set<string>())  // yours, in Claude's file in a dimmed copy's place: no second rise
  for (const id of inFile) swapped.current.add(id)

  // what arrives while you watch comes in with a short rise; never the history, on opening or coming back
  const seen = useRef<Arrivals | undefined>(undefined)
  const askId = ask ? `ask:${ask.question}` : ''
  seen.current = arrive(seen.current, [...shownItems.map((it) => it.id), ...(askId ? [askId] : [])], shown,
    state.waiting ? null : state.events)
  const live = useRef(false)
  live.current = !seen.current.quiet
  const rise = (id: string) => rises(seen.current!, id) && !swapped.current.has(id) ? ' chat-in' : ''

  // Ctrl+F (⌘F on a Mac) while the chat shows: find in the conversation
  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') { e.preventDefault(); openFind() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown])
  // Ctrl+B, as in Claude: the shell command it runs now goes on in the background (only while Claude offers it)
  const canBackground = !!screen?.background
  useEffect(() => {
    if (!shown || !canBackground) return
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault()
        background().catch(fail)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shown, canBackground])  // eslint-disable-line react-hooks/exhaustive-deps
  // the marks the chat drew: count them, mark the current one, bring it into view
  useEffect(() => {
    const marks = [...(list.current?.querySelectorAll<HTMLElement>('mark.chat-hit') ?? [])]
    setHit((h) => (h.total === marks.length && h.n < Math.max(marks.length, 1)) ? h : { n: 0, total: marks.length })
  }, [q, state.events.length])
  useEffect(() => {
    const marks = [...(list.current?.querySelectorAll<HTMLElement>('mark.chat-hit') ?? [])]
    marks.forEach((m, k) => { if (k === hit.n) m.dataset.on = '1'; else delete m.dataset.on })
    if (q && marks[hit.n]) { atEnd.current = false; gliding.current = false; marks[hit.n].scrollIntoView({ block: 'center' }) }
  }, [hit, q])

  /** To the end: smoothly for what arrives while you watch, at once for the history. */
  const toEnd = (smooth: boolean) => {
    const el = list.current
    if (!el) return
    const top = el.scrollHeight - el.clientHeight
    if (top - el.scrollTop < 1) return
    gliding.current = smooth && !calm()
    el.scrollTo({ top, behavior: gliding.current ? 'smooth' : 'auto' })
  }
  // follow the end while you are at it, whatever grows: a new item, a result, the working row, a question, a box
  // that takes room below. It followed only when the number of items changed, so you scrolled yourself
  // (2026-11-24 report: "I don't see any animation, or scrolling, I should scroll myself")
  useLayoutEffect(() => {
    const el = list.current, body = content.current
    if (!el || !body || typeof ResizeObserver === 'undefined') return
    const grew = new ResizeObserver(() => { if (atEnd.current) toEnd(live.current) })
    grew.observe(body)
    grew.observe(el)
    return () => grew.disconnect()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { if (shown && atEnd.current) toEnd(false) }, [shown])  // eslint-disable-line react-hooks/exhaustive-deps
  // something new at the end while you read further up: a button takes you there
  const tip = `${shownItems.at(-1)?.id ?? ''} ${askId}`
  const lastTip = useRef(tip)
  useEffect(() => {
    if (tip !== lastTip.current && lastTip.current.trim() && !atEnd.current) setBelow(true)
    lastTip.current = tip
  }, [tip])
  const follow = () => { atEnd.current = true; setBelow(false); toEnd(true) }

  const fail = (e: Error) => toast(e.message, { kind: 'error' })
  const drop = (p: Pending) => setPending((ps) => ps.filter((x) => x.id !== p.id))
  const submit = (text = draft) => {
    const t = text.trim()
    if (!t) return
    const mine = text === draft  // a command from the / menu leaves what you typed in the box
    const p = pends(t) ? pend(t, shownItems, pending, Date.now(), `pending-${++sends.current}`) : null
    if (p) { setPending((ps) => [...ps, p]); setNow(p.at) }
    // not sent (a question or a menu is open): your text comes back to the box, never lost, and its copy goes
    const keep = (e: Error) => { setDraft((d) => d.trim() ? d : t); if (p) drop(p); fail(e) }
    if (needsTerminal(t)) {
      void send(t).then(onTerminal).catch(keep)
      toast('That command opens a menu: answer it in the terminal')
    } else {
      void send(t).catch(keep)
    }
    if (mine) setDraft('')
    sent.current = { text: t, at: Date.now(), seen: false }
    follow()  // what you send always takes you to the end
  }
  const command = (c: string) => {
    setSlash(false)
    if (c !== '/model' && c !== '/effort') submit(c)
    else if (!draft.trim()) setDraft(c + ' ')
    else toast(`Your message stays in the box. Pick ${c === '/model' ? 'a model' : 'an effort'} at the top instead`)
  }

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
            <button key={m.value} title={wait ? 'Claude is still starting' : m.note} aria-pressed={screen?.mode === m.value}
              disabled={wait || !!switching}
              onClick={() => {
                setSwitching(m.value as Mode)
                mode(m.value as Mode).catch(fail).finally(() => setSwitching(null))
              }}
              className={`h-7 rounded-md px-2.5 text-sm disabled:cursor-default ${switching === m.value
                ? 'animate-pulse bg-hover' : screen?.mode === m.value ? 'bg-selected font-semibold'
                : wait ? 'text-dim opacity-60' : 'text-dim hover:bg-hover'}`}>
              {m.label}</button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
      {finding && <TextFind input={findBox} query={query} hit={hit} onQuery={setQuery} onStep={step} onClose={closeFind} />}
      <div ref={list} className="h-full overflow-y-auto select-text"
        onScroll={(e) => {
          const el = e.currentTarget
          const gap = el.scrollHeight - el.scrollTop - el.clientHeight
          const up = el.scrollTop < lastTop.current - 1  // ours only goes down: up is you (or the end moving up)
          lastTop.current = el.scrollTop
          if (gliding.current && !up) { if (gap < 2) gliding.current = false; return }
          gliding.current = false
          atEnd.current = gap < 80
          if (atEnd.current) setBelow(false)
        }}
        /* you scrolling (the wheel, a touch, a drag on the bar, keys) ends a glide of ours: from there you decide */
        onWheel={(e) => { if (e.deltaY < 0) gliding.current = false }}
        onPointerDown={() => { gliding.current = false }}
        onKeyDown={() => { gliding.current = false }}>
        <div ref={content} className="mx-auto flex w-full max-w-[820px] flex-col gap-3.5 px-6 pt-5 pb-3">
          {state.unknown && (
            <div className="rounded-xl border border-line bg-card p-4 text-sm">
              This chat started before HPC Hub could follow it, so it shows only in the terminal. Chats you start or
              resume from now on show here.
              <div className="mt-3"><button onClick={onTerminal} className="h-8 rounded-lg border border-line-strong px-3 hover:bg-hover">Open the terminal</button></div>
            </div>
          )}
          {state.waiting && !state.unknown && <div className="py-10 text-center text-sm text-dim">Waiting for Claude to start…</div>}
          {!state.waiting && wait && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-dim">
              <span className="size-2 animate-pulse rounded-full bg-[var(--color-orange)]" />Claude is starting…
            </div>
          )}
          {state.trimmed && <div className="text-center text-xs text-dim">Earlier messages are in the terminal</div>}
          {shownItems.map((it) => {
            if (it.kind === 'tool') return <ToolCard key={it.id} t={it} rise={rise(it.id)} />
            if (it.kind === 'user' && it.again) {  // stopped before an answer, sent again below: kept, quietly
              return (
                <div key={it.id} className={`flex max-w-[78%] flex-col items-end gap-1 self-end${rise(it.id)}`}>
                  <div className="rounded-2xl border border-dashed border-line-strong px-4 py-2.5 whitespace-pre-wrap text-dim"><Hl text={it.text} /></div>
                  <span className="text-xs text-dim">Stopped before Claude answered · sent again below</span>
                </div>
              )
            }
            if (it.kind === 'user') {
              return <div key={it.id} className={`max-w-[78%] self-end rounded-2xl bg-control px-4 py-2.5 whitespace-pre-wrap${rise(it.id)}`}><Hl text={it.text} /></div>
            }
            if (it.kind === 'command') {
              return <div key={it.id} className={`self-end font-mono text-sm text-dim${rise(it.id)}`}><Hl text={it.text} /></div>
            }
            if (it.kind === 'note') return <div key={it.id} className={`text-center text-xs whitespace-pre-wrap text-dim${rise(it.id)}`}><Hl text={it.text} /></div>
            return <Prose key={it.id} text={it.text} rise={rise(it.id)} />
          })}
          {left.map((p) => (  // yours, on its way: dimmed until Claude's file has it, then that one stands here
            <div key={p.id} className="chat-in flex max-w-[78%] flex-col items-end gap-1 self-end">
              <div className="rounded-2xl bg-control px-4 py-2.5 whitespace-pre-wrap opacity-60"><Hl text={p.text} /></div>
              <span className="text-xs text-dim">{pendingNote(p, !!screen?.busy, now)}</span>
            </div>
          ))}
          {ask && (
            <div key={askId} className={`flex flex-col gap-2.5 rounded-xl border p-3.5 ${ask.permission ? 'border-warn/50 bg-warn-bg' : 'border-accent/40 bg-accent-soft'}${rise(askId)}`}>
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
            <div className="chat-fade flex items-center gap-2 text-sm text-dim">
              <span className="typing" aria-hidden="true"><span /><span /><span /></span>Claude is working
              <button onClick={() => { sent.current = null; stop().catch(fail) }} className="ml-2 rounded-md border border-line-strong px-2 py-0.5 text-xs hover:bg-hover">Stop</button>
              {screen.background && (
                <button onClick={() => background().catch(fail)} title="Ctrl+B: the command goes on in the background and Claude carries on"
                  className="rounded-md border border-line-strong px-2 py-0.5 text-xs hover:bg-hover">Run in background</button>
              )}
            </div>
          )}
          {state.error && <div className="text-sm text-bad">{state.error}</div>}
        </div>
      </div>
      {below && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
          <button onClick={follow}
            className="chat-in pointer-events-auto flex h-7 items-center gap-1.5 rounded-full border border-line-strong bg-window px-3
              text-xs shadow-[var(--shadow-menu)] hover:bg-hover">
            <ArrowDown size={12} />New messages</button>
        </div>
      )}
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
          {given && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-accent-soft px-3 py-1.5 text-sm">
              <span className="min-w-0 flex-1">Claude gave your message back, unsent. Edit it below and send: it
                replaces what is in Claude's box.</span>
              {draft.trim() !== given.trim() && (
                <button onClick={() => setDraft(given)}
                  className="shrink-0 rounded-md border border-line-strong bg-window px-2 py-0.5 text-xs hover:bg-hover">
                  Edit Claude's copy</button>
              )}
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
