import { GitCompareArrows, History as HistoryIcon, MoreHorizontal, Search, StickyNote } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { call } from '../../../rpc'
import type { GitJob, GitState, HCommit, Lanes, Pick, Refs, SavedSetting, SavedVersion, SwitchCheck, SwitchDone,
  SyncDone, SyncState } from '../../../types/history'
import { useToast } from '../../toast'
import { Button, Spinner } from '../../ui'
import { remember, remembered } from '../storage'
import { AgentChip } from './agent/AgentChip'
import { BranchBar } from './branches/BranchBar'
import { SwitchDialog } from './branches/SwitchDialog'
import { SwitchingCard } from './branches/SwitchingCard'
import { Detail } from './detail/Detail'
import { lastLine, plural } from './format'
import { git, type Where } from './git'
import type { Go } from './go'
import { CommitList, type Sel } from './list/CommitList'
import { NotesPanel } from './notes/NotesPanel'
import type { CardSpot } from './notes/SpotCard'
import { PushView } from './push/PushView'
import { Timeline } from './timeline/Timeline'
import { Center } from './ui/Center'
import type { Assist } from './useAssist'
import { useJob } from './useJob'
import { useSeconds } from './useSeconds'
import { SavedSettings } from './versions/SavedSettings'

/** Asks from outside the tab: the Git menu's Push or Get the latest, the timeline, Open in History from a line. */
export type HistoryAsk = { kind: 'push' | 'pull' | 'timeline' | 'commit' | 'now' | 'notes'; hash?: string; n: number }

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
  assist: Assist  // the agent's help and the notes (useAssist)
  go: Go  // a cited line or page
  onSpot: (s: CardSpot) => void  // the floating card: ask about a spot in the PDF, or note it
}

type Run = { id: string; push: boolean; error: string }

export function History({ where, clusterName, main, pdf, active, ask, guard, onBuild, onFiles, onPause, onOpen, onSave,
  assist, go, onSpot }: Props) {
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
  // notes
  const [notesOpen, setNotesOpenState] = useState(() => remembered<string>('history.notes', '0') === '1')
  const [notesFocus, setNotesFocus] = useState('')
  const setNotesOpen = (on: boolean) => { setNotesOpenState(on); remember('history.notes', on ? '1' : '0') }

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

  const commitSplit = async (parts: { message: string; files: string[] }[], push: boolean) => {
    if (!(await onSave())) return false
    try {
      const r = await git<{ commits: number }>('commit_split', where, { commits: parts })
      toast(`Made ${plural(r.commits, 'commit')}`)
      await refresh()
      if (push) void startSync(true)
      return true
    } catch (e) {
      toast(`Could not commit: ${lastLine((e as Error).message)}`, { kind: 'error' })
      await refresh()
      return false
    }
  }

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

  const showNote = (id: string) => { setNotesOpenState(true); setNotesFocus(id) }
  const handlers = useRef({ startSync, openTimeline, setSel, showNote })
  handlers.current = { startSync, openTimeline, setSel, showNote }
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
    else if (ask.kind === 'notes') h.showNote(ask.hash ?? '')
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
  const openNotes = assist.notes?.notes.filter((n) => !n.done).length ?? 0
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
            <button onClick={() => setNotesOpen(!notesOpen)} aria-pressed={notesOpen} title="Notes: comments and to-dos"
              className={`relative grid size-9 shrink-0 place-items-center rounded-lg ${notesOpen ? 'bg-selected'
                : 'bg-pill hover:bg-pressed'}`}>
              <StickyNote size={16} />
              {openNotes > 0 && <span className="note-pin absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center
                rounded-full px-1 text-[10px] font-semibold">{openNotes}</span>}</button>
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
            onCompareBranch={compareBranch} onLatest={() => void startSync(false)} onPush={() => void startSync(true)}
            agent={<AgentChip choice={assist.choice} clusterName={clusterName} installed={assist.installed}
              onOpen={assist.loadInstalled} onChoose={(c) => void assist.choose(c)} />} />
        </div>
        <div className={`relative flex min-w-0 flex-1 flex-col ${switching ? 'pointer-events-none opacity-60' : ''}`}>
          {sel.kind === 'sync' ? (
            <PushView push={run?.push ?? paused?.push ?? true} steps={syncJob?.steps ?? []} running={!!run && !paused && !run.error
              && !syncJob?.done} paused={paused} error={run?.error ?? ''} busy={settling} onStop={stopSync}
              onContinue={settle} onRetry={() => void startSync(run?.push ?? true)}
              onOpen={(p, l) => onOpen(`${state.root}/${p}`, l)} />
          ) : (
            <Detail key={JSON.stringify(sel) + (sel.kind === 'now' ? state.head : '')} sel={sel} where={where} state={state} commits={commits} saved={saved} refs={refs}
              clusterName={clusterName} main={main} pdf={pdf} guard={guard} onOpen={onOpen} onFiles={onFiles}
              onRefresh={refresh} onSel={setSel} onPickInList={setPicking} onCommit={commit} onCommitSplit={commitSplit}
              assist={assist} go={go} onSpot={onSpot} onPin={showNote} />
          )}
        </div>
        {notesOpen && <NotesPanel assist={assist} focus={notesFocus} onClose={() => setNotesOpen(false)}
          go={{ ...go, place: (p) => 'path' in p ? go.line(p.path, p.line) : 'page' in p ? go.page(p.page)
            : setSel({ kind: 'commit', hash: commits.find((c) => c.hash.startsWith(p.hash))?.hash ?? p.hash }) }} />}
      </div>
      {switching && <SwitchingCard target={switching.target} steps={switchJob?.steps ?? []} expected={switching.expected}
        brought={switching.brought} seconds={seconds} />}
      {check && <SwitchDialog check={check} clusterName={clusterName} onClose={() => setCheck(null)}
        onSwitch={(mode) => void doSwitch(check.target, mode)}
        onCommitFirst={() => { setAfterCommit(check.target); setCheck(null); setSel({ kind: 'now' }) }} />}
    </div>
  )
}
