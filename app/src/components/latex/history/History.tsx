// The History tab: why each change happened, in the LaTeX and in the PDF. The commit list on the left (changes not
// committed yet on top), the picked commit, two versions compared, a saved version or a push on the right, and the
// branch bar under the list. Git runs over the connection to the cluster; only PDFs of other versions are builds.
import { Check, Copy, GitCompareArrows, History as HistoryIcon, MoreHorizontal, Pencil, RotateCcw, Search, Undo2,
  ArrowUp, ArrowLeftRight, ArrowRight, Circle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { call } from '../../../rpc'
import type { Changes, GitJob, GitState, HCommit, Lanes, Pick, Refs, SavedSetting, SavedVersion, SwitchCheck,
  SwitchDone, SyncDone, SyncState } from '../../../types/history'
import { useToast } from '../../toast'
import { Button, Spinner } from '../../ui'
import { Avatar, Counts, fileName, fullDate, git, lastLine, plural, Segments, shortHash, useJob, useSeconds,
  when, type Where } from './bits'
import { BranchBar, SwitchDialog, SwitchingCard } from './Branches'
import { CommitList, type Sel } from './CommitList'
import { DiffView, type Layout, type PutBack } from './DiffView'
import { PdfView } from './PdfView'
import { PushView } from './Push'
import { SavedSettings, VersionPicker } from './Pickers'
import { Timeline } from './Timeline'

/** Asks from outside the tab: the Git menu's Push or Get the latest, the timeline, Open in History from a line. */
export type HistoryAsk = { kind: 'push' | 'pull' | 'timeline' | 'commit' | 'now'; hash?: string; n: number }

type Props = {
  where: Where
  clusterName: string
  main: string
  pdf: Uint8Array | null  // the PDF you have now
  active: boolean
  ask: HistoryAsk | null
  guard: (what: string, run: () => void) => void  // a compute node first, for builds
  onBuild: () => void  // Recompile
  onFiles: () => void  // files changed on the cluster: read them again
  onPause: (paused: boolean) => void  // editing waits while git changes the files
  onOpen: (path: string, line: number) => void  // a file and line in the Editor
  onSave: () => Promise<boolean>
  messageTools?: ReactNode  // next to the commit message box (later: Write message)
}

type Run = { id: string; push: boolean; error: string }

export function History({ where, clusterName, main, pdf, active, ask, guard, onBuild, onFiles, onPause, onOpen, onSave,
  messageTools }: Props) {
  const toast = useToast()
  const [state, setState] = useState<GitState | null>(null)
  const [commits, setCommits] = useState<HCommit[]>([])
  const [saved, setSaved] = useState<SavedVersion[]>([])
  const [refs, setRefs] = useState<Refs | null>(null)
  const [error, setError] = useState('')
  const [sel, setSel] = useState<Sel>({ kind: 'now' })
  const [query, setQuery] = useState('')
  const [settings, setSettings] = useState(false)
  const [timeline, setTimeline] = useState(false)
  const [lanes, setLanes] = useState<Lanes | null>(null)
  const [picking, setPicking] = useState<'from' | 'to' | null>(null)
  const [pulled, setPulled] = useState<Set<string>>(new Set())
  // switching
  const [check, setCheck] = useState<SwitchCheck | null>(null)
  const [switching, setSwitching] = useState<{ id: string; target: string; brought: number; expected: string[] } | null>(null)
  const [afterCommit, setAfterCommit] = useState<string | null>(null)  // switch here once committed
  // pushing
  const [run, setRun] = useState<Run | null>(null)
  const [paused, setPaused] = useState<SyncState | null>(null)
  const [settling, setSettling] = useState(false)
  const before = useRef<HCommit[]>([])  // the commits before a push or Get the latest, to mark what came in
  const first = useRef(true)

  const refresh = useCallback(async () => {
    try {
      const st = await git<GitState>('state', where)
      setState(st)
      setError('')
      if (!st.root) return
      const [log, sv] = await Promise.all([git<HCommit[]>('log', where), git<SavedVersion[]>('saved', where)])
      setCommits(log)
      setSaved(sv)
      git<Refs>('refs', where).then(setRefs).catch(() => {})
      if (first.current) {
        first.current = false
        if (st.syncing) {
          const s = await git<SyncState | null>('sync_state', where)
          if (s) { setPaused(s); setRun({ id: '', push: s.push, error: '' }); setSel({ kind: 'sync' }); onPause(true) }
        } else if (!st.changes.length && log[0]) setSel({ kind: 'commit', hash: log[0].hash })
      }
    } catch (e) { setError((e as Error).message) }
  }, [where, onPause])
  useEffect(() => { if (active) void refresh() }, [active, refresh])

  // -- commit -----------------------------------------------------------------------------------------------------
  const commit = async (message: string, push: boolean) => {
    if (!(await onSave())) return false
    try {
      await call('latex.git_commit', { ...where, message })
      toast('Committed')
      await refresh()
      if (afterCommit) { const t = afterCommit; setAfterCommit(null); void doSwitch(t, 'bring') }
      else if (push) void startSync(true)
      return true
    } catch (e) {
      toast(`Could not commit: ${lastLine((e as Error).message)}`, { kind: 'error' })
      return false
    }
  }

  // -- switch -----------------------------------------------------------------------------------------------------
  const askSwitch = async (target: string) => {
    if (!(await onSave())) return
    try {
      const c = await git<SwitchCheck>('switch_check', where, { target })
      if (!c.changes.length) void doSwitch(target, 'bring', c)
      else setCheck(c)
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  const doSwitch = async (target: string, mode: 'bring' | 'keep', c: SwitchCheck | null = check) => {
    setCheck(null)
    const n = c?.changes.length ?? 0
    const expected = [...(n ? [`Made a safe copy of your ${plural(n, 'change')}`] : []),
      ...(state?.remotes.length ? ['Got the latest from origin'] : []), `Updating ${plural(c?.files ?? 0, 'file')}`,
      'Rebuild the PDF']
    onPause(true)
    try {
      const { id } = await git<{ id: string }>('switch', where, { target, mode })
      setSwitching({ id, target, brought: mode === 'bring' ? n : 0, expected })
    } catch (e) {
      onPause(false)
      toast(lastLine((e as Error).message), { kind: 'error' })
    }
  }
  const switchJob = useJob(switching?.id ?? null, (j: GitJob) => {
    const target = switching?.target ?? ''
    setSwitching(null)
    onPause(false)
    onFiles()
    void refresh().then(() => setSel({ kind: 'now' }))
    if (!j.ok) { toast(`Could not switch: ${lastLine(j.error ?? '')}`, { kind: 'error' }); return }
    const r = j.result as SwitchDone
    onBuild()
    const along = r.brought ? ` Your ${plural(r.brought, 'change')} came along.` : r.kept ? ` Your changes wait on ${r.from}.` : ''
    const back = r.back === 'back' ? ' Your changes kept here are back.' : r.back === 'kept'
      ? ' Your changes kept here clash now, so they wait in Saved versions.' : ''
    toast(`Now on ${target}.${along}${back}`, { action: { label: `Switch back to ${r.from}`, run: () => void askSwitch(r.from) } })
  })
  const seconds = useSeconds(!!switching)

  const newBranch = async (name: string, start: string) => {
    if (!(await onSave())) return
    try {
      await git('new_branch', where, { name, start: start === state?.head ? '' : start })
      toast(`Now on ${name}`)
      await refresh()
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }

  // -- push and Get the latest -------------------------------------------------------------------------------------
  const startSync = async (push: boolean) => {
    if (!(await onSave())) return
    before.current = commits
    setPaused(null)
    setSel({ kind: 'sync' })
    onPause(true)
    try {
      const { id } = await git<{ id: string }>('sync', where, { push })
      setRun({ id, push, error: '' })
    } catch (e) {
      onPause(false)
      setRun({ id: '', push, error: lastLine((e as Error).message) })
    }
  }
  const syncJob = useJob(run?.id || null, (j: GitJob) => {
    const r = j.result as (SyncDone | SyncState | undefined)
    if (!j.ok) {
      setRun((x) => x && { ...x, error: lastLine(j.error ?? 'It did not work') })
      onPause(false)
      onFiles()
      void refresh()
      return
    }
    if (r && 'done' in r && r.done) {
      setRun(null)
      setPaused(null)
      onPause(false)
      onFiles()
      const parts = [r.push ? (r.pushed ? `Pushed ${plural(r.pushed, 'commit')}` : 'Nothing new to push')
        : (r.pulled ? `Got ${plural(r.pulled, 'new commit')}` : 'Already up to date'),
      r.back ? `your ${plural(r.back, 'change')} ${r.back === 1 ? 'is' : 'are'} back` : '']
      toast(parts.filter(Boolean).join(', '))
      void refresh().then(() => setSel({ kind: 'now' }))
      if (r.pulled) {  // new hashes, minus your own commits that were put on top again
        const had = new Set(before.current.map((c) => `${c.author}\n${c.subject}`))
        git<HCommit[]>('log', where, { limit: r.pulled + r.pushed + 5 }).then((l) => setPulled(new Set(l
          .filter((c) => !before.current.some((b) => b.hash === c.hash) && !had.has(`${c.author}\n${c.subject}`))
          .map((c) => c.hash)))).catch(() => {})
      }
    } else if (r) {
      setPaused(r as SyncState)
      void refresh()
    }
  })
  const settle = async (picks: Record<string, Pick[]>) => {
    setSettling(true)
    try {
      for (const [path, p] of Object.entries(picks)) await git('settle', where, { path, picks: p })
      const { id } = await git<{ id: string }>('sync_continue', where)
      setRun((x) => ({ id, push: x?.push ?? true, error: '' }))
      setPaused(null)
    } catch (e) {
      toast(lastLine((e as Error).message), { kind: 'error' })
    } finally { setSettling(false) }
  }
  const stopSync = async () => {
    setSettling(true)
    try {
      const r = await git<{ stopped: boolean; kept: boolean }>('sync_stop', where)
      toast(r.kept ? 'Stopped. Your changes are in Saved versions.' : 'Stopped. Everything is back as it was.')
    } catch (e) {
      toast(lastLine((e as Error).message), { kind: 'error' })
    } finally {
      setSettling(false)
      setRun(null)
      setPaused(null)
      onPause(false)
      onFiles()
      void refresh().then(() => setSel({ kind: 'now' }))
    }
  }

  // -- timeline and compare -----------------------------------------------------------------------------------------
  const openTimeline = () => {
    setTimeline(true)
    setLanes(null)
    if (sel.kind !== 'compare') {
      const c = sel.kind === 'commit' ? commits.find((x) => x.hash === sel.hash) : null
      setSel(c ? { kind: 'compare', from: c.parents[0] ?? c.hash, to: c.hash }
        : { kind: 'compare', from: commits[0]?.hash ?? '', to: '' })
    }
  }
  const compareBranch = async (name: string) => {
    try {
      const l = await git<Lanes>('lanes', where, { a: state?.branch || 'HEAD', b: name })
      setLanes(l)
      setTimeline(true)
      const tip = l.only_b[0]?.hash ?? refs?.remote.find((r) => r.name === name)?.hash ?? name
      setSel({ kind: 'compare', from: state?.head ?? '', to: tip })
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  const select = (s: Sel) => {
    if (picking && (s.kind === 'commit' || s.kind === 'now') && sel.kind === 'compare') {
      const v = s.kind === 'now' ? '' : s.hash
      setSel(picking === 'from' ? { ...sel, from: v } : { ...sel, to: v })
      setPicking(null)
      return
    }
    if (sel.kind === 'sync' && (run || paused)) return  // the push needs you first
    setSel(s)
  }

  const setSetting = async (mode: SavedSetting) => {
    try {
      await git('saved_setting', where, { mode })
      setState((s) => s && { ...s, saved: mode })
      if (mode === 'backup') toast(`Saved versions go to origin too, as saved/${state?.login}/${state?.branch}`)
      void refresh()
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }

  // -- asks from outside ------------------------------------------------------------------------------------------
  const handlers = useRef({ startSync, openTimeline, setSel })
  handlers.current = { startSync, openTimeline, setSel }
  const lastAsk = useRef(0)
  const root = state?.root
  useEffect(() => {
    if (!ask || ask.n === lastAsk.current || !root) return
    lastAsk.current = ask.n
    const h = handlers.current
    if (ask.kind === 'push' || ask.kind === 'pull') void h.startSync(ask.kind === 'push')
    else if (ask.kind === 'timeline') h.openTimeline()
    else if (ask.kind === 'commit' && ask.hash) h.setSel({ kind: 'commit', hash: ask.hash })
    else if (ask.kind === 'now') h.setSel({ kind: 'now' })
  }, [ask, root])

  if (error) return <Center><p className="text-bad">{error}</p><Button size="sm" onClick={refresh}>Try again</Button></Center>
  if (!state) return <Center><Spinner size={24} /></Center>
  if (!state.root) {
    return <Center><HistoryIcon size={36} strokeWidth={1.25} className="text-dim" />
      <p className="font-semibold">This paper is not in git yet</p>
      <p className="max-w-sm text-center text-sm text-dim">Its history shows here once the folder is a git repository,
        for example after cloning it from GitHub or GitLab.</p></Center>
  }
  const selCommit = sel.kind === 'commit' ? commits.find((c) => c.hash === sel.hash) ?? null : null
  const start = selCommit?.hash ?? state.head
  const busy = switching ? { label: `Switching to ${switching.target}` }
    : run && !paused && !run.error ? { label: run.push ? 'Pushing' : 'Getting the latest' }
    : paused ? { label: `${run?.push ? 'Push' : 'Update'} paused: ${plural(paused.spots.length, 'spot')} to settle` } : null
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-window">
      {timeline && <Timeline commits={commits} saved={saved} branch={state.branch} lanes={lanes} backup={state.saved === 'backup'}
        before={sel.kind === 'compare' ? sel.from : commits[1]?.hash ?? ''} after={sel.kind === 'compare' ? sel.to : ''}
        onChange={(from, to) => setSel({ kind: 'compare', from, to })} onClose={() => { setTimeline(false); setLanes(null) }} />}
      <div className="flex min-h-0 flex-1">
        <div className={`flex w-[340px] shrink-0 flex-col border-r border-line ${switching ? 'opacity-60' : ''}`}>
          <div className="relative flex shrink-0 items-center gap-2 p-2.5">
            <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg bg-pill px-2.5">
              <Search size={15} className="text-dim" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search commits"
                aria-label="Search commits" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint" />
            </label>
            <button onClick={() => sel.kind === 'compare' ? openTimeline() : setSel({ kind: 'compare',
              from: selCommit?.parents[0] ?? commits[0]?.hash ?? '', to: selCommit?.hash ?? '' })}
              className="flex h-9 items-center gap-1.5 rounded-lg bg-pill px-3 text-sm font-semibold hover:bg-pressed">
              <GitCompareArrows size={15} /> Compare</button>
            <button onClick={() => setSettings(!settings)} aria-label="Saved versions" title="Saved versions"
              className={`grid size-9 place-items-center rounded-lg ${settings ? 'bg-selected' : 'bg-pill hover:bg-pressed'}`}>
              <MoreHorizontal size={16} /></button>
            {settings && <SavedSettings value={state.saved} user={state.login} branch={state.branch}
              onPick={setSetting} onClose={() => setSettings(false)} />}
          </div>
          {picking && <div className="mx-2.5 mb-1.5 rounded-lg bg-accent-soft px-3 py-1.5 text-sm">Pick the
            {picking === 'from' ? ' From' : ' To'} version in the list. <button className="underline"
              onClick={() => setPicking(null)}>Cancel</button></div>}
          <CommitList state={state} commits={commits} saved={saved} sel={sel} query={query} pulled={pulled}
            aside={paused ? paused.changes : 0} onSelect={select} />
          <BranchBar where={where} state={state} busy={busy} start={start} onSwitch={askSwitch} onNewBranch={newBranch}
            onCompareBranch={compareBranch} onLatest={() => void startSync(false)} onPush={() => void startSync(true)} />
        </div>
        <div className={`relative flex min-w-0 flex-1 flex-col ${switching ? 'pointer-events-none opacity-60' : ''}`}>
          {sel.kind === 'sync' ? (
            <PushView push={run?.push ?? paused?.push ?? true} steps={syncJob?.steps ?? []} running={!!run && !paused && !run.error
              && !syncJob?.done} paused={paused} error={run?.error ?? ''} busy={settling} onStop={stopSync}
              onContinue={settle} onRetry={() => void startSync(run?.push ?? true)}
              onOpen={(p, l) => onOpen(`${state.root}/${p}`, l)} />
          ) : (
            <Detail key={JSON.stringify(sel)} sel={sel} where={where} state={state} commits={commits} saved={saved} refs={refs}
              clusterName={clusterName} main={main} pdf={pdf} guard={guard} onOpen={onOpen} onFiles={onFiles}
              onRefresh={refresh} onSel={setSel} onPickInList={setPicking} onCommit={commit} messageTools={messageTools} />
          )}
        </div>
      </div>
      {switching && <SwitchingCard target={switching.target} steps={switchJob?.steps ?? []} expected={switching.expected}
        brought={switching.brought} seconds={seconds} />}
      {check && <SwitchDialog check={check} clusterName={clusterName} onClose={() => setCheck(null)}
        onSwitch={(mode) => void doSwitch(check.target, mode)}
        onCommitFirst={() => { setAfterCommit(check.target); setCheck(null); setSel({ kind: 'now' }) }} />}
    </div>
  )
}

function Center({ children }: { children: ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center gap-3 p-6">{children}</div>
}

// -- the right side -----------------------------------------------------------------------------------------------
type DetailProps = {
  sel: Sel
  where: Where
  state: GitState
  commits: HCommit[]
  saved: SavedVersion[]
  refs: Refs | null
  clusterName: string
  main: string
  pdf: Uint8Array | null
  guard: (what: string, run: () => void) => void
  onOpen: (path: string, line: number) => void
  onFiles: () => void
  onRefresh: () => Promise<void>
  onSel: (s: Sel) => void
  onPickInList: (side: 'from' | 'to') => void
  onCommit: (message: string, push: boolean) => Promise<boolean>
  messageTools?: ReactNode
}

function remembered<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback } catch { return fallback }
}
function remember(key: string, v: string) { try { localStorage.setItem(key, v) } catch { /* private window */ } }

function Detail(p: DetailProps) {
  const { sel, where, state, commits, saved } = p
  const toast = useToast()
  const [pane, setPaneState] = useState<'latex' | 'pdf'>(() => remembered('history.pane', 'latex'))
  const [layout, setLayoutState] = useState<Layout>(() => remembered('history.layout', sel.kind === 'now' ? 'inline' : 'split'))
  const [changes, setChanges] = useState<Changes | null>(null)
  const [failed, setFailed] = useState('')
  const [more, setMore] = useState(false)
  const setPane = (v: 'latex' | 'pdf') => { setPaneState(v); remember('history.pane', v) }
  const setLayout = (v: Layout) => { setLayoutState(v); remember('history.layout', v) }
  const commit = sel.kind === 'commit' ? commits.find((c) => c.hash === sel.hash) ?? null : null
  const version = sel.kind === 'saved' ? saved.find((v) => v.hash === sel.hash) ?? null : null
  const [from, to] = sel.kind === 'commit' ? [commit?.parents[0] ?? '', sel.hash]
    : sel.kind === 'compare' ? [sel.from, sel.to] : sel.kind === 'saved' ? [sel.hash, ''] : ['', '']
  const load = useCallback(() => {
    setFailed('')
    const frm = sel.kind === 'commit' ? '' : from
    git<Changes>('changes', where, { frm, to, context: more ? 100000 : 3 }).then(setChanges)
      .catch((e: Error) => setFailed(lastLine(e.message)))
  }, [where, sel.kind, from, to, more])
  useEffect(load, [load])
  const abs = (path: string) => `${state.root}/${path}`
  const putBack = async (b: PutBack) => {
    try {
      await git('put_back', where, { path: b.path, line: b.line, expect: b.expect, lines: b.lines })
      toast(b.lines.length > 1 ? 'Lines put back' : b.lines.length ? 'Line put back' : 'Removed')
      p.onFiles()
      load()
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  const pdfFrom = sel.kind === 'now' ? state.head : from
  const body = sel.kind === 'commit' && !commit ? null : failed ? <p className="px-6 py-10 text-center text-bad">{failed}</p>
    : !changes ? <div className="grid flex-1 place-items-center"><Spinner size={22} /></div>
    : pane === 'pdf' ? <PdfView where={where} main={p.main} root={state.root} clusterName={p.clusterName} current={p.pdf}
        from={pdfFrom} to={to} changes={changes} guard={(run) => p.guard('The PDF build', run)}
        onSource={(path, line) => p.onOpen(path, line)} />
    : <DiffView changes={changes} layout={layout} onLayout={setLayout} onMore={more ? undefined : () => setMore(true)}
        onOpen={(path, line) => p.onOpen(abs(path), line)} note={sel.kind === 'now' ? 'Build files are left out' : undefined}
        onPutBack={sel.kind === 'saved' ? putBack : undefined}
        sides={sel.kind === 'commit' && commit ? [<><HistoryIcon size={13} /> Before
          <code className="rounded bg-pill px-1.5 text-xs">{shortHash(from || commit.hash)}</code>
          {commits.find((c) => c.hash === from) && when(commits.find((c) => c.hash === from)!.time)}</>,
          <><Circle size={13} /> After <code className="rounded bg-pill px-1.5 text-xs">{commit.short}</code>
          {when(commit.time)}</>] : sel.kind === 'saved' && version ? [<><Circle size={13} className="text-faint" /> Saved
          version {when(version.time, true)}</>, <><Pencil size={13} /> Now</>] : undefined} />
  const switcher = <Segments value={pane} onChange={setPane} options={[['latex', 'LaTeX'], ['pdf', 'PDF']]} />
  return (
    <>
      {sel.kind === 'commit' && commit && <CommitHead commit={commit} switcher={switcher} />}
      {sel.kind === 'commit' && !commit && <div className="p-6 text-dim">That commit is not in the last 300.</div>}
      {sel.kind === 'now' && <NowHead state={state} switcher={switcher} onCommit={p.onCommit} tools={p.messageTools} />}
      {sel.kind === 'compare' && <CompareHead {...p} from={sel.from} to={sel.to} changes={changes} switcher={switcher} />}
      {sel.kind === 'saved' && version && <SavedHead {...p} version={version} changes={changes} switcher={switcher}
        onRestored={() => { p.onFiles(); void p.onRefresh().then(() => p.onSel({ kind: 'now' })) }} />}
      {body}
    </>
  )
}

function CommitHead({ commit, switcher }: { commit: HCommit; switcher: ReactNode }) {
  const toast = useToast()
  const lines = commit.added + commit.removed
  return (
    <div className="shrink-0 border-b border-line px-6 pt-4 pb-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold select-text">{commit.subject}</h2>
          {commit.body && <p className="mt-1 max-w-[760px] whitespace-pre-line text-dim select-text">{commit.body}</p>}
        </div>
        {switcher}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-dim">
        <Avatar name={commit.author} size={20} />
        <b className="text-text">{commit.author}</b> committed {Date.now() / 1000 - commit.time < 2 * 86400
          ? `${when(commit.time)}, ${fullDate(commit.time)}` : fullDate(commit.time)}
        <button onClick={() => navigator.clipboard.writeText(commit.hash).then(() => toast('Commit id copied'))
          .catch(() => toast('Could not copy'))} title="Copy the commit id"
          className="flex items-center gap-1 rounded bg-pill px-1.5 font-mono text-xs hover:bg-pressed">
          {commit.short} <Copy size={11} /></button>
        <span>{plural(commit.files.length, 'file')}, {plural(lines, 'line')} changed</span>
        {commit.tags.map((t) => <span key={t} className="rounded border border-line-strong px-1.5 text-xs">{t}</span>)}
      </div>
    </div>
  )
}

function NowHead({ state, switcher, onCommit, tools }:
  { state: GitState; switcher: ReactNode; onCommit: (m: string, push: boolean) => Promise<boolean>; tools?: ReactNode }) {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<'' | 'commit' | 'push'>('')
  const go = async (push: boolean) => {
    if (!message.trim() || busy) return
    setBusy(push ? 'push' : 'commit')
    if (await onCommit(message.trim(), push)) setMessage('')
    setBusy('')
  }
  const none = !state.changes.length
  return (
    <div className="shrink-0 border-b border-line px-6 pt-4 pb-3">
      <div className="flex items-center gap-3">
        <span className="grid size-7 place-items-center rounded-full border border-dashed border-line-strong text-dim">
          <Pencil size={13} /></span>
        <h2 className="min-w-0 flex-1 text-xl font-semibold">Not committed yet</h2>
        {switcher}
      </div>
      <p className="mt-1 text-dim">{none ? 'Nothing changed since your last commit.' : <>Your changes since <code
        className="rounded bg-pill px-1.5 font-mono text-sm">{shortHash(state.head)}</code>{state.saved_at
        ? `, saved ${when(state.saved_at)}` : ''}. Co-authors see them after you commit and push.</>}</p>
      {!none && (
        <div className="mt-3 flex items-start gap-2">
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Say what changed and why"
            aria-label="Commit message" rows={Math.min(5, Math.max(1, message.split('\n').length))}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void go(false) }}
            className="min-h-9 w-[360px] max-w-full resize-none rounded-lg bg-pill px-3 py-2 text-base leading-5 outline-none
              placeholder:text-faint focus:ring-2 focus:ring-focus" />
          {tools}
          <Button kind="primary" disabled={!message.trim() || !!busy} onClick={() => void go(false)}>
            {busy === 'commit' ? <Spinner size={14} /> : <Check size={15} />} Commit</Button>
          <Button disabled={!message.trim() || !!busy || !state.remotes.length} onClick={() => void go(true)}
            title={state.remotes.length ? 'Commit, then pull first and push' : 'This paper has no remote'}>
            {busy === 'push' ? <Spinner size={14} /> : <ArrowUp size={15} />} Commit and push</Button>
        </div>
      )}
      {!none && <p className="mt-1.5 text-xs text-dim">The first line is the summary; a blank line, then the why.
        Ctrl+Enter commits.</p>}
    </div>
  )
}

function CompareHead(p: DetailProps & { from: string; to: string; changes: Changes | null; switcher: ReactNode }) {
  const { from, to, commits, refs, state } = p
  const lo = from === '' ? -1 : commits.findIndex((c) => c.hash === from)
  const hi = to === '' ? -1 : commits.findIndex((c) => c.hash === to)
  const between = lo >= 0 ? commits.slice(Math.max(0, hi), lo) : []
  const authors = [...new Set(between.map((c) => c.author))]
  const names = authors.length > 1 ? `${authors.slice(0, -1).join(', ')} and ${authors[authors.length - 1]}` : authors[0]
  return (
    <div className="shrink-0 border-b border-line px-6 pt-3.5 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg text-dim">Compare</span>
        <VersionPicker value={from} commits={commits} refs={refs} head={state.head} allowNow={false}
          onPick={(v) => p.onSel({ kind: 'compare', from: v, to })} onPickInList={() => p.onPickInList('from')} />
        <ArrowRight size={16} className="text-dim" />
        <VersionPicker value={to} commits={commits} refs={refs} head={state.head} allowNow
          onPick={(v) => p.onSel({ kind: 'compare', from, to: v })} onPickInList={() => p.onPickInList('to')} />
        {to !== '' && <button onClick={() => p.onSel({ kind: 'compare', from: to, to: from })} aria-label="Swap"
          title="Swap" className="grid size-8 place-items-center rounded-md text-dim hover:bg-hover"><ArrowLeftRight size={15} /></button>}
        <span className="flex-1" />
        {p.switcher}
      </div>
      <div className="mt-2 flex items-center gap-2 text-sm text-dim">
        <span className="flex -space-x-1">{authors.slice(0, 4).map((a) => <Avatar key={a} name={a} size={20} />)}</span>
        {(between.length > 0 || to === '') && <span>{between.length > 0 ? `${plural(between.length, 'commit')} by ${names}${
          to === '' && state.changes.length ? ', plus your changes' : ''}` : 'Your changes not committed yet'} ·</span>}
        {p.changes && <span>{plural(p.changes.files.length, 'file')} <Counts added={p.changes.added}
          removed={p.changes.removed} /></span>}
      </div>
    </div>
  )
}

function SavedHead(p: DetailProps & { version: SavedVersion; changes: Changes | null; switcher: ReactNode
  onRestored: () => void }) {
  const { version, where } = p
  const toast = useToast()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const files = p.changes?.files ?? []
  const copy = async () => {
    const path = files[0]?.path ?? version.files[0]
    if (!path) return
    try {
      const { text } = await git<{ text: string }>('file', where, { at: version.hash, path })
      await navigator.clipboard.writeText(text)
      toast(`Copied ${fileName(path)} as it was at ${when(version.time, true)}`)
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }
  const restore = async () => {
    setBusy(true)
    try {
      await git('restore', where, { version: version.hash })
      toast('Restored. What you had is a saved version now.')
      setAsking(false)
      p.onRestored()
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) } finally { setBusy(false) }
  }
  const at = when(version.time, true)
  return (
    <div className="relative shrink-0 border-b border-line px-6 pt-4 pb-3">
      <div className="flex items-center gap-2">
        <Circle size={14} className="text-dim" />
        <h2 className="min-w-0 flex-1 text-xl font-semibold">Saved version, {at}</h2>
        <Button size="sm" onClick={copy}><Copy size={14} /> Copy text</Button>
        <Button size="sm" onClick={() => setAsking(true)}><RotateCcw size={14} /> Restore this version</Button>
        {p.switcher}
      </div>
      <p className="mt-1 text-dim">{version.kind === 'Saved' || version.kind === 'Compiled' ? 'Saved automatically.'
        : `${version.kind}.`} Not a commit, never pushed with your work. Kept 30 days.</p>
      <p className="mt-1 text-sm text-dim">Comparing with <b className="text-text">Now</b>
        {p.changes && <> · {files.length ? `${files.map((f) => fileName(f.path)).slice(0, 3).join(', ')}, ${plural(
          p.changes.added + p.changes.removed, 'line')} differ` : 'the same as now'}</>}</p>
      {asking && (
        <div className="dialog-in absolute top-14 right-6 z-20 w-[380px] rounded-xl border border-line bg-raised p-4 shadow-xl">
          <div className="font-semibold">Restore the paper as it was at {at}?</div>
          <p className="mt-1 text-sm text-dim">Your files go back to this version. What you have now is saved as a version
            first, so you can come back to it. Nothing is committed.</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" onClick={() => setAsking(false)}>Cancel</Button>
            <Button size="sm" kind="primary" disabled={busy} onClick={restore}><Undo2 size={14} /> Restore</Button>
          </div>
        </div>
      )}
    </div>
  )
}
