import { useCallback, useEffect, useRef, useState } from 'react'

import { call } from '../../../rpc'
import type { GitState, HCommit, SavedSetting } from '../../../types/history'
import { ReportLink } from '../../report/ReportLink'
import { Button } from '../../ui/Button'
import { Spinner } from '../../ui/Spinner'
import { useToast } from '../../useToast'
import { remember, remembered } from '../storage'
import { AgentChip } from './agent/AgentChip'
import { BranchBar } from './branches/BranchBar'
import { SwitchDialog } from './branches/SwitchDialog'
import { SwitchingCard } from './branches/SwitchingCard'
import { Detail } from './detail/Detail'
import { lastLine, plural } from './format'
import { git, type Where } from './git'
import type { Go } from './go'
import { busyLabel } from './jobText'
import { CommitList, type Sel } from './list/CommitList'
import { ListToolbar } from './list/ListToolbar'
import { PickHint } from './list/PickHint'
import { NotesPanel } from './notes/NotesPanel'
import type { CardSpot } from './notes/SpotCard'
import { PushView } from './push/PushView'
import { Timeline } from './timeline/Timeline'
import { Center } from './ui/Center'
import { NotInGit } from './ui/NotInGit'
import type { Assist } from './useAssist'
import { useCompare } from './useCompare'
import { useRepo } from './useRepo'
import { useSwitch } from './useSwitch'
import { useSync } from './useSync'

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
  onOpen: (path: string, line: number) => void
  onSave: () => Promise<boolean>
  assist: Assist
  go: Go
  onSpot: (s: CardSpot) => void  // the floating card: ask about a spot in the PDF, or note it
}

export function History({ where, clusterName, main, pdf, active, ask, guard, onBuild, onFiles, onPause, onOpen, onSave,
  assist, go, onSpot }: Props) {
  const toast = useToast()
  const [sel, setSel] = useState<Sel>({ kind: 'now' })
  const [query, setQuery] = useState('')
  const [notesOpen, setNotesOpenState] = useState(() => remembered<string>('history.notes', '0') === '1')
  const [notesFocus, setNotesFocus] = useState('')
  const setNotesOpen = (on: boolean) => { setNotesOpenState(on); remember('history.notes', on ? '1' : '0') }

  // before useRepo, whose first load can resume a paused push; the arrows read repo once it exists
  const sync = useSync({ where, commits: () => repo.commits, onSave, onPause, onFiles, refresh: () => repo.refresh(),
    setSel })
  const { resume } = sync
  const onFirst = useCallback(async (st: GitState, log: HCommit[]) => {
    if (!(await resume(st)) && !st.changes.length && log[0]) setSel({ kind: 'commit', hash: log[0].hash })
  }, [resume])
  const repo = useRepo(where, active, onFirst)
  const { state, setState, commits, saved, refs, error, refresh } = repo
  const switcher = useSwitch({ where, state, onSave, onPause, onFiles, onBuild, refresh, setSel })
  const { run, paused } = sync
  const { switching } = switcher
  const compare = useCompare({ where, state, refs, commits, sel, setSel })

  const commit = async (message: string, push: boolean) => {
    if (!(await onSave())) return false
    try {
      await call('latex.git_commit', { ...where, message })
      toast('Committed')
      await refresh()
      if (!switcher.committed() && push) void sync.start(true)
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

  const newBranch = async (name: string, start: string) => {
    if (!(await onSave())) return
    try {
      await git('new_branch', where, { name, start: start === state?.head ? '' : start })
      toast(`Now on ${name}`)
      await refresh()
    } catch (e) { toast(lastLine((e as Error).message), { kind: 'error' }) }
  }

  const select = (s: Sel) => {
    if (compare.pick(s)) return
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
  const handlers = useRef({ startSync: sync.start, openTimeline: compare.open, setSel, showNote })
  handlers.current = { startSync: sync.start, openTimeline: compare.open, setSel, showNote }
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

  if (error) return <Center><p className="text-bad">{error}</p><ReportLink error={error} /><Button size="sm" onClick={refresh}>Try again</Button></Center>
  if (!state) return <Center><Spinner size={24} /></Center>
  if (!state.root) return <NotInGit />
  const selCommit = sel.kind === 'commit' ? commits.find((c) => c.hash === sel.hash) ?? null : null
  const { check } = switcher
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-window">
      {compare.timeline && <Timeline commits={commits} saved={saved} branch={state.branch} lanes={compare.lanes}
        backup={state.saved === 'backup'}
        before={sel.kind === 'compare' ? sel.from : commits[1]?.hash ?? ''} after={sel.kind === 'compare' ? sel.to : ''}
        onChange={(from, to) => setSel({ kind: 'compare', from, to })} onClose={compare.close} />}
      <div className="flex min-h-0 flex-1">
        <div className={`flex w-[340px] shrink-0 flex-col border-r border-line ${switching ? 'opacity-60' : ''}`}>
          <ListToolbar state={state} query={query} onQuery={setQuery} notesOpen={notesOpen}
            openNotes={assist.notes?.notes.filter((n) => !n.done).length ?? 0} onNotes={() => setNotesOpen(!notesOpen)}
            onSetting={setSetting} onCompare={() => sel.kind === 'compare' ? compare.open() : setSel({ kind: 'compare',
              from: selCommit?.parents[0] ?? commits[0]?.hash ?? '', to: selCommit?.hash ?? '' })} />
          {compare.picking && <PickHint end={compare.picking} onCancel={() => compare.setPicking(null)} />}
          <CommitList state={state} commits={commits} saved={saved} sel={sel} query={query} pulled={sync.pulled}
            aside={paused ? paused.changes : 0} onSelect={select} />
          <BranchBar where={where} state={state} busy={busyLabel(switching?.target ?? null, run, paused)}
            start={selCommit?.hash ?? state.head} onSwitch={switcher.ask} onNewBranch={newBranch}
            onCompareBranch={compare.branch} onLatest={() => void sync.start(false)} onPush={() => void sync.start(true)}
            agent={<AgentChip choice={assist.choice} clusterName={clusterName} installed={assist.installed}
              onOpen={assist.loadInstalled} onChoose={(c) => void assist.choose(c)} />} />
        </div>
        <div className={`relative flex min-w-0 flex-1 flex-col ${switching ? 'pointer-events-none opacity-60' : ''}`}>
          {sel.kind === 'sync' ? (
            <PushView push={run?.push ?? paused?.push ?? true} steps={sync.job?.steps ?? []} running={!!run && !paused
              && !run.error && !sync.job?.done} paused={paused} error={run?.error ?? ''} busy={sync.settling}
              onStop={sync.stop} onContinue={sync.settle} onRetry={() => void sync.start(run?.push ?? true)}
              onOpen={(p, l) => onOpen(`${state.root}/${p}`, l)} />
          ) : (
            <Detail key={JSON.stringify(sel) + (sel.kind === 'now' ? state.head : '')} sel={sel} where={where} state={state} commits={commits} saved={saved} refs={refs}
              clusterName={clusterName} main={main} pdf={pdf} guard={guard} onOpen={onOpen} onFiles={onFiles}
              onRefresh={refresh} onSel={setSel} onPickInList={compare.setPicking} onCommit={commit} onCommitSplit={commitSplit}
              assist={assist} go={go} onSpot={onSpot} onPin={showNote} />
          )}
        </div>
        {notesOpen && <NotesPanel assist={assist} focus={notesFocus} onClose={() => setNotesOpen(false)}
          go={{ ...go, place: (p) => 'path' in p ? go.line(p.path, p.line) : 'page' in p ? go.page(p.page)
            : setSel({ kind: 'commit', hash: commits.find((c) => c.hash.startsWith(p.hash))?.hash ?? p.hash }) }} />}
      </div>
      {switching && <SwitchingCard target={switching.target} steps={switcher.job?.steps ?? []} expected={switching.expected}
        brought={switching.brought} seconds={switcher.seconds} />}
      {check && <SwitchDialog check={check} clusterName={clusterName} onClose={() => switcher.setCheck(null)}
        onSwitch={(mode) => void switcher.go(check.target, mode)}
        onCommitFirst={() => { switcher.commitFirst(check.target); setSel({ kind: 'now' }) }} />}
    </div>
  )
}
