// The paper's history on the phone: the commit list and the change you picked, in one scroll, with the desktop's
// hooks. Notes (and Ask) open as a page of their own. Blame and branches are not on the phone yet.
import '@shared/components/latex/history/history.css'

import { Archive, ArrowDown, ArrowUp, ChevronRight, ChevronUp, GitBranch, GitCompareArrows, Pencil, Search, StickyNote, Tag } from 'lucide-react'
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { AgentIcon } from '@shared/components/latex/history/agent/AgentIcon'
import { chipLabel } from '@shared/components/latex/history/agent/labels'
import { branchStatus } from '@shared/components/latex/history/branches/status'
import { clock, fileName, group, lastLine, plural, when } from '@shared/components/latex/history/format'
import { git, type Where } from '@shared/components/latex/history/git'
import type { Go } from '@shared/components/latex/history/go'
import type { Sel } from '@shared/components/latex/history/list/CommitList'
import { busyLabel } from '@shared/components/latex/history/jobText'
import type { CardSpot } from '@shared/components/latex/history/notes/SpotCard'
import { PushView } from '@shared/components/latex/history/push/PushView'
import { Avatar } from '@shared/components/latex/history/ui/Avatar'
import { Counts } from '@shared/components/latex/history/ui/Counts'
import { NotInGit } from '@shared/components/latex/history/ui/NotInGit'
import type { Assist } from '@shared/components/latex/history/useAssist'
import { useCompare } from '@shared/components/latex/history/useCompare'
import { useRepo } from '@shared/components/latex/history/useRepo'
import { useSync } from '@shared/components/latex/history/useSync'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { GitState, HCommit, SavedVersion } from '@shared/types/history'
import { Button, useToast } from '../../../ui'
import { AgentDialog } from './AgentDialog'
import { AssistView, type AskOpen } from './AssistView'
import { Detail } from './Detail'

const FIRST = 8  // commits shown before Show more, so what you pick stays close

export type HistoryAsk = { kind: 'push' | 'pull' | 'timeline' | 'notes' | 'now'; hash?: string; n: number }

type Props = {
  where: Where
  clusterName: string
  main: string
  pdf: Uint8Array | null
  active: boolean
  ask: HistoryAsk | null
  top: number  // the History tab tapped again: back to the commit list
  guard: (what: string, run: () => void) => void
  onBuild: () => void
  onFiles: () => void
  onPause: (paused: boolean) => void
  onOpen: (path: string, line: number) => void
  onSave: () => Promise<boolean>
  assist: Assist
  go: Go
  onSpot: (s: CardSpot) => void
  assistOpen: boolean
  onAssist: (open: boolean) => void
}

export function History(p: Props) {
  const { where, active, ask, assist, go, onSave, onPause, onFiles, assistOpen, onAssist, top } = p
  const toast = useToast()
  const [sel, setSel] = useState<Sel>({ kind: 'now' })
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  const [open, setOpen] = useState<Set<string>>(new Set())  // the saved versions unfolded
  const [asking, setAsking] = useState<AskOpen | null>(null)
  const [focus, setFocus] = useState('')
  const [agent, setAgent] = useState(false)
  const detail = useRef<HTMLDivElement>(null)

  useEffect(() => {  // the History tab, tapped again: back to the list
    if (top) { onAssist(false); setAsking(null); setFocus('') }
  }, [top])  // eslint-disable-line react-hooks/exhaustive-deps

  const sync = useSync({ where, commits: () => repo.commits, onSave, onPause, onFiles, refresh: () => repo.refresh(), setSel })
  const { resume } = sync
  const onFirst = useCallback(async (st: GitState, log: HCommit[]) => {
    if (!(await resume(st)) && !st.changes.length && log[0]) setSel({ kind: 'commit', hash: log[0].hash })
  }, [resume])
  const repo = useRepo(where, active, onFirst)
  const { state, setState, commits, saved, refs, error, refresh } = repo
  const { run, paused } = sync
  const compare = useCompare({ where, state, refs, commits, sel, setSel })
  void setState

  const commit = async (message: string, push: boolean) => {
    if (!(await onSave())) return false
    try {
      await call('latex.git_commit', { ...where, message })
      toast('Committed')
      await refresh()
      if (push) void sync.start(true)
      return true
    } catch (e) {
      toast(`Could not commit: ${lastLine((e as Error).message)}`, { kind: 'error' })
      return false
    }
  }
  const commitSplit = async (parts: { message: string; files: string[] }[], push: boolean) => {
    if (!(await onSave())) return false
    try {
      const r = await git<{ commits: number }>('commit_split', where, { commits: parts })
      toast(`Made ${plural(r.commits, 'commit')}`)
      await refresh()
      if (push) void sync.start(true)
      return true
    } catch (e) {
      toast(`Could not commit: ${lastLine((e as Error).message)}`, { kind: 'error' })
      await refresh()
      return false
    }
  }

  const select = (s: Sel) => {
    if (compare.pick(s)) return
    if (sel.kind === 'sync' && (run || paused)) return  // the push needs you first
    setSel(s)
    requestAnimationFrame(() => detail.current?.scrollIntoView({ block: 'start' }))
  }
  const showNote = (id: string) => { setFocus(id); onAssist(true) }
  const askAbout = (a: AskOpen) => { setAsking(a); onAssist(true) }

  const handlers = useRef({ start: sync.start, setSel, showNote })
  handlers.current = { start: sync.start, setSel, showNote }
  const lastAsk = useRef(0)
  const root = state?.root
  useEffect(() => {
    if (!ask || ask.n === lastAsk.current || !root) return
    lastAsk.current = ask.n
    const h = handlers.current
    if (ask.kind === 'push' || ask.kind === 'pull') void h.start(ask.kind === 'push')
    else if (ask.kind === 'timeline') setSel((s) => s.kind === 'compare' ? s : { kind: 'compare', from: commits[0]?.hash ?? '', to: '' })
    else if (ask.kind === 'notes') h.showNote(ask.hash ?? '')
    else h.setSel({ kind: 'now' })
  }, [ask, root])  // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="flex h-full flex-col items-center justify-center gap-3 p-6"><p className="text-bad">{error}</p>
    <Button small onClick={refresh}>Try again</Button></div>
  if (!state) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  if (!state.root) return <NotInGit />
  const selCommit = sel.kind === 'commit' ? commits.find((c) => c.hash === sel.hash) ?? null : null
  const openNotes = assist.notes?.notes.filter((n) => !n.done).length ?? 0
  const busy = busyLabel(null, run, paused)
  const goPlace = { ...go, place: (pl: Parameters<Parameters<typeof AssistView>[0]['go']['place']>[0]) =>
    'path' in pl ? go.line(pl.path, pl.line) : 'page' in pl ? go.page(pl.page)
      : (onAssist(false), setSel({ kind: 'commit', hash: commits.find((c) => c.hash.startsWith(pl.hash))?.hash ?? pl.hash })) }

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-window">
      {assistOpen ? <AssistView assist={assist} go={goPlace} asking={asking} onAskClose={() => setAsking(null)}
        onAskMore={setAsking} focus={focus} onClose={() => { onAssist(false); setAsking(null); setFocus('') }} /> : <>
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
          <label className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-lg bg-soft px-3">
            <Search size={16} className="shrink-0 text-dim" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search commits" aria-label="Search commits"
              className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" />
          </label>
          <Button small icon={GitCompareArrows} onClick={() => sel.kind === 'compare' ? undefined
            : select({ kind: 'compare', from: selCommit?.parents[0] ?? commits[0]?.hash ?? '', to: selCommit?.hash ?? '' })}>Compare</Button>
          <button onClick={() => onAssist(true)} aria-label="Notes" className="relative grid size-8 shrink-0 place-items-center rounded-md active:bg-pressed">
            <StickyNote size={16} />
            {openNotes > 0 && <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1
              text-[10px] font-semibold text-on-accent">{openNotes}</span>}</button>
        </div>
        {compare.picking && <p className="mx-3 mt-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-sm">Pick the {compare.picking === 'from' ? 'From' : 'To'} version in the list. <button
          className="underline" onClick={() => compare.setPicking(null)}>Cancel</button></p>}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CommitRows state={state} commits={commits} saved={saved} sel={sel} query={query} pulled={sync.pulled} all={all} onAll={() => setAll(true)}
            aside={paused ? paused.changes : 0} open={open} onOpen={setOpen} onSelect={select} />
          <div className="flex items-center gap-2 border-y border-line px-3 py-1.5 text-sm">
            <GitBranch size={14} className="shrink-0 text-dim" /><b className="max-w-[140px] truncate">{state.branch || 'no branch'}</b>
            <span className="min-w-0 flex-1 truncate text-dim">{busy ? busy.label : branchStatus(state)}</span>
            {assist.choice && <button onClick={() => { assist.loadInstalled(); setAgent(true) }}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-1 text-dim active:bg-pressed">
              <AgentIcon agent={assist.choice.agent} /> <span className="max-w-[120px] truncate">{chipLabel(assist.choice, assist.choice.agents)}</span>
              <ChevronUp size={13} /></button>}
          </div>
          <div className="h-1.5 bg-soft" />
          <div ref={detail}>
            {sel.kind === 'sync' ? <div className="phone-push"><PushView push={run?.push ?? paused?.push ?? true} steps={sync.job?.steps ?? []}
              running={!!run && !paused && !run.error && !sync.job?.done} paused={paused} error={run?.error ?? ''} busy={sync.settling}
              onStop={sync.stop} onContinue={sync.settle} onRetry={() => void sync.start(run?.push ?? true)}
              onOpen={(path, l) => p.onOpen(`${state.root}/${path}`, l)} /></div>
              : <Detail key={JSON.stringify(sel) + (sel.kind === 'now' ? state.head : '')} sel={sel} where={where} state={state} commits={commits}
                  saved={saved} refs={refs} clusterName={p.clusterName} main={p.main} pdf={p.pdf} guard={p.guard} onOpen={p.onOpen}
                  onFiles={onFiles} onRefresh={refresh} onSel={setSel} onPickInList={compare.setPicking} onCommit={commit}
                  onCommitSplit={commitSplit} assist={assist} onAsk={askAbout} onSpot={p.onSpot} onPin={showNote} />}
          </div>
        </div>
      </>}
      {agent && assist.choice && <AgentDialog choice={assist.choice} clusterName={p.clusterName} installed={assist.installed}
        onChoose={(c) => void assist.choose(c)} onClose={() => setAgent(false)} />}
    </div>
  )
}

function CommitRows({ state, commits, saved, sel, query, pulled, all, onAll, aside, open, onOpen, onSelect }: {
  state: GitState; commits: HCommit[]; saved: SavedVersion[]; sel: Sel; query: string; pulled: Set<string>; all: boolean
  onAll: () => void; aside: number; open: Set<string>; onOpen: (s: Set<string>) => void; onSelect: (s: Sel) => void
}) {
  const q = query.trim().toLowerCase()
  const matched = q ? commits.filter((c) => [c.subject, c.body, c.author, c.hash, ...c.tags, ...c.files.map((f) => f.path)]
    .some((x) => x.toLowerCase().includes(q))) : commits
  const limit = q || all ? matched.length : FIRST
  const shown = matched.slice(0, limit)
  const heads = new Set(shown.map((c, i) => i === 0 || group(c.time) !== group(shown[i - 1].time) ? c.hash : ''))
  const changed = state.changes.reduce((a, c) => [a[0] + c.added, a[1] + c.removed], [0, 0])
  const now = sel.kind === 'now' || sel.kind === 'sync'
  const fold = (key: string, list: SavedVersion[], label: string, first = 0) => {
    if (!list.length || q) return null
    const opened = open.has(key)
    const rows = opened ? list : list.slice(0, first)
    return <>
      {rows.map((v) => (
        <button key={v.hash} onClick={() => onSelect({ kind: 'saved', hash: v.hash })}
          className={`flex h-9 w-full items-center gap-3 pr-3 pl-6 text-left text-sm ${sel.kind === 'saved' && sel.hash === v.hash
            ? 'bg-selected font-semibold' : 'text-dim active:bg-pressed'}`}>
          <span className="size-[7px] shrink-0 rounded-full border border-faint" />
          <span className="w-11 shrink-0 tabular-nums text-text">{clock(v.time)}</span>
          <span className="min-w-0 flex-1 truncate">{v.kind}</span>
          <span className="truncate font-mono text-xs">{v.files.length ? fileName(v.files[0]) : ''}</span>
        </button>
      ))}
      {list.length > rows.length && (
        <button onClick={() => onOpen(new Set(open).add(key))} className="flex h-9 w-full items-center gap-2 pr-3 pl-5 text-left text-sm text-dim active:bg-pressed">
          <span className="tracking-[2px] text-faint">•••</span> {plural(list.length - rows.length, 'saved version')} · {label} <ChevronRight size={13} /></button>
      )}
    </>
  }
  return (
    <div className="pb-1">
      {!q && <>
        <Item selected={now} onClick={() => onSelect({ kind: 'now' })}
          icon={<span className="grid size-[22px] place-items-center rounded-full border border-dashed border-line-strong text-dim"><Pencil size={11} /></span>}
          title={<span className={now ? 'font-semibold' : 'italic text-dim'}>Not committed yet</span>}
          meta={aside ? <><Archive size={12} className="inline" /> Put aside for the push · {plural(aside, 'file')}</>
            : state.changes.length ? `You · ${state.saved_at ? `saved ${when(state.saved_at)}` : 'not saved as a version'} · ${plural(state.changes.length, 'file')}`
            : 'Nothing changed since your last commit'}
          counts={state.changes.length ? <Counts added={changed[0]} removed={changed[1]} /> : null} />
        {fold('now', saved.filter((v) => v.base === state.head), `since ${clock(saved.filter((v) => v.base === state.head).slice(-1)[0]?.time ?? 0)}`, 3)}
      </>}
      {shown.map((c) => {
        const i = commits.indexOf(c)
        const toPush = i < state.ahead && !!state.upstream
        return (
          <Fragment key={c.hash}>
            {heads.has(c.hash) && <div className="px-4 pt-2.5 pb-0.5 text-xs font-semibold text-dim">{group(c.time)}</div>}
            <Item selected={sel.kind === 'commit' && sel.hash === c.hash} onClick={() => onSelect({ kind: 'commit', hash: c.hash })}
              icon={<Avatar name={c.author} />}
              title={<>{c.subject}{c.tags.map((t) => <span key={t} className="ml-1.5 inline-flex h-5 items-center gap-1 rounded border border-line-strong px-1.5 align-[1px] text-xs font-normal text-dim"><Tag size={10} /> {t}</span>)}</>}
              meta={<>{c.author} · {when(c.time)} · {plural(c.files.length, 'file')}
                {toPush && <Chip><ArrowUp size={10} /> to push</Chip>}
                {pulled.has(c.hash) && <Chip><ArrowDown size={10} /> just pulled</Chip>}</>}
              counts={<Counts added={c.added} removed={c.removed} />} />
            {fold(c.hash, saved.filter((v) => c.parents[0] && v.base === c.parents[0]), 'before this commit')}
          </Fragment>
        )
      })}
      {!all && !q && matched.length > limit && <button onClick={onAll} className="flex h-10 w-full items-center justify-center text-sm font-semibold text-dim active:bg-pressed">
        Show {matched.length - limit} more</button>}
      {!shown.length && <p className="px-4 py-6 text-center text-sm text-dim">{q ? 'No commit matches.' : 'No commits yet.'}</p>}
    </div>
  )
}

const Chip = ({ children }: { children: ReactNode }) => (
  <span className="ml-1.5 inline-flex h-[18px] items-center gap-0.5 rounded border border-line-strong px-1 text-[11px]">{children}</span>
)

function Item({ selected, icon, title, meta, counts, onClick }: { selected: boolean; icon: ReactNode; title: ReactNode
  meta: ReactNode; counts: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`relative flex w-full items-center gap-2.5 py-2 pr-3 pl-4 text-left ${selected ? 'bg-selected' : 'active:bg-pressed'}`}>
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-text" />}
      {icon}
      <span className="min-w-0 flex-1">
        <span className={`block truncate ${selected ? 'font-semibold' : ''}`}>{title}</span>
        <span className="block truncate text-sm text-dim">{meta}</span>
      </span>
      {counts}
    </button>
  )
}
