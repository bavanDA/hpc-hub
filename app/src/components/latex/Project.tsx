import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { BuildDone, Issue, Opened, Settings, SourceSpot, Spot } from '../../types/latex'
import { useAskForNode } from '../clusters/AskForNode'
import { type PdfTarget } from '../pdf'
import { OpenDialog } from '../tools/OpenDialog'
import { useToast } from '../useToast'
import { basename, inFolder, moved, rel, under } from './bits'
import { BuildButton } from './BuildButton'
import type { EditorHandle } from './editor/CodeEditor'
import { EditorPane } from './EditorPane'
import { FileTree } from './files/FileTree'
import { useTreeActions } from './files/useTreeActions'
import { GitMenu } from './git/GitMenu'
import { useHistoryTab } from './history/useHistoryTab'
import { buildMessage, issueFile, issuesIn, labels as labelsIn } from './issues'
import { PdfPane } from './PdfPane'
import { ProjectBar } from './ProjectBar'
import { remember, remembered } from './storage'
import { Split } from './ui/Split'
import { useBuild } from './useBuild'
import { useBuiltPdf } from './useBuiltPdf'
import { useCites } from './useCites'
import { useDoc } from './useDoc'
import { useProjectKeys } from './useProjectKeys'
import { ViewSwitch, type View } from './ViewSwitch'

export function Project({ project, onClose }: { project: Opened; onClose: () => void }) {
  const toast = useToast()
  const nodeFirst = useAskForNode()
  const { cluster, folder } = project
  const where = useMemo(() => ({ cluster, folder }), [cluster, folder])
  const [main, setMain] = useState(project.main)
  const [tree, setTree] = useState(project.tree)
  const [settings, setSettings] = useState<Settings>(project.settings)
  const [logsOpen, setLogsOpen] = useState(false)
  const [view, setViewState] = useState<View>(() => remembered('latex.view', 'split'))
  const [showTree, setShowTree] = useState(() => remembered<string>('latex.tree', '1') === '1')
  const [auto, setAuto] = useState(() => remembered<string>('latex.auto', '0') === '1')
  const [target, setTarget] = useState<PdfTarget | null>(null)
  const [dialog, setDialog] = useState<ReactNode>(null)
  const [openIn, setOpenIn] = useState(false)
  const [focused, setFocused] = useState(false)  // Just the PDF: this header, the files and the editor hide
  const editor = useRef<EditorHandle | null>(null)
  const { doc, setDoc, docRef, error: docError, dirty, saving, load, save, edit } = useDoc(cluster, project.main)
  const { pdf, progress, reload: loadPdf } = useBuiltPdf(cluster, main)
  const cites = useCites(cluster, folder, tree)

  const setView = (v: View) => { setViewState(v); remember('latex.view', v) }

  const switchTo = async (path: string, line?: number) => {
    if (docRef.current?.path === path) { if (line) editor.current?.goto(line); return }
    if (await save()) load(path, line)
  }
  const reloadDoc = () => { const d = docRef.current; if (d) load(d.path, editor.current?.line()) }

  const refresh = useCallback(() => {
    call<typeof tree>('latex.tree', where).then(setTree).catch((e: Error) => toast(e.message))
  }, [where, toast])

  const built = (d: BuildDone) => {
    if (d.ok) loadPdf()
    else if (!d.stopped) setLogsOpen(true)
    const message = buildMessage(d)
    if (message) toast(message)
  }
  // "Build on my compute node" with none yet would build on the login node: ask first
  const builder = useBuild({ cluster, main, save, onDone: built,
    guard: (run) => settings.on_node ? nodeFirst.guard(cluster, 'The PDF build', run) : run() })
  const { build, last } = builder

  const saveNow = async () => { if (await save() && auto) build() }

  const toPdf = (line: number) => {
    const d = docRef.current
    if (!d) return
    call<Spot | null>('latex.sync_view', { cluster, main, path: d.path, line })
      .then((s) => {
        if (!s) { toast('This line is not in the PDF'); return }
        if (view === 'editor' || view === 'reader') setView('split')
        setLogsOpen(false)
        setTarget({ ...s, n: Date.now() })
      })
      .catch((e: Error) => toast(e.message))
  }
  const fromPdf = (page: number, x: number, y: number) => {
    call<SourceSpot | null>('latex.sync_edit', { cluster, main, page, x, y })
      .then((s) => {
        if (!s) { toast('No source for that spot'); return }
        if (view === 'pdf') setView('split')
        switchTo(s.path, s.line)
      })
      .catch((e: Error) => toast(e.message))
  }
  const goIssue = (i: Issue) => {
    const files = tree.filter((e) => e.kind === 'f').map((e) => e.path)
    const hit = issueFile(i, files, folder, main, docRef.current?.path ?? null)
    if (!hit) { toast(`${i.file} is not in the project`); return }
    if (view === 'pdf') setView('split')
    switchTo(inFolder(folder, hit), i.line || 1)
  }

  const actions = useTreeActions({ cluster, folder, clusterName: project.cluster_name, tree, refresh,
    dialog: setDialog, setMain, edit: (p) => void switchTo(p),
    moved: (from, to) => {
      const d = docRef.current
      const path = d ? moved(d.path, from, to) : null
      if (d && path !== null) setDoc({ ...d, path })
      const m = moved(main, from, to)
      if (m !== null) setMain(m)
    },
    removed: (p) => { const d = docRef.current; if (d && under(d.path, p)) load(main) } })

  const inHistory = view === 'history'
  const history = useHistoryTab({ where, clusterName: project.cluster_name, main, pdf: pdf.data, docPath: doc?.path ?? null,
    docVersion: doc?.version ?? 0, dirty, active: inHistory, save, build, toPdf,
    show: (on) => setView(on ? 'history' : 'split'),
    guard: (what, run) => settings.on_node ? nodeFirst.guard(cluster, what, run) : run(),
    agentGuard: (detail, run) => nodeFirst.guard(cluster, 'The agent', run, detail),
    nodeWaiting: nodeFirst.waiting === 'The agent',
    toPage: (page) => { setLogsOpen(false); setTarget({ page, x: 0, y: 0, n: Date.now() }) },
    selection: () => editor.current?.selection() ?? null,
    reload: () => { refresh(); loadPdf(); reloadDoc() },
    goTo: (path, line) => { void switchTo(path, line) } })

  useProjectKeys({ saveNow, build, toPdf }, editor)

  const docRel = doc ? rel(folder, doc.path) : ''
  const fileIssues = useMemo(() => doc ? issuesIn(last?.issues ?? [], doc.path, main) : [], [last, doc, main])
  const labels = useMemo(() => doc ? labelsIn(doc.text) : [], [doc])
  const latexSource = useMemo(() => ({ cluster, main }), [cluster, main])

  return (
    <div className="flex h-full flex-col bg-window">
      <ProjectBar name={project.name} where={`${project.cluster_name} · ${rel(folder, main)}`}
        status={saving ? 'Saving…' : dirty ? 'Not saved' : 'Saved'} hidden={focused} showTree={showTree}
        onTree={() => { setShowTree(!showTree); remember('latex.tree', showTree ? '0' : '1') }}
        views={<ViewSwitch view={view} onView={setView} more={history.tab} />}
        tools={<>
          <BuildButton cluster={cluster} clusterName={project.cluster_name} running={builder.running} settings={settings}
            onSettings={setSettings} auto={auto} onAuto={(on) => { setAuto(on); remember('latex.auto', on ? '1' : '0') }}
            onBuild={build} />
          <GitMenu where={where} before={save} safe={history} onPulled={() => { refresh(); reloadDoc() }} />
        </>}
        onOpenIn={() => setOpenIn(true)} onClose={async () => { if (await save()) onClose() }} />
      <div className={`flex min-h-0 flex-1 ${inHistory ? 'hidden' : ''}`}>
        {showTree && !focused && <div className="w-[236px] shrink-0 border-r border-line">
          <FileTree id={`${cluster}:${folder}`} entries={tree} current={docRel} main={rel(folder, main)}
            actions={actions} /></div>}
        <Split name="editor" show={focused ? 'right' : view === 'split' ? 'both' : view === 'editor' ? 'left' : 'right'}
          left={<EditorPane doc={doc} error={docError} name={docRel || basename(main)} dirty={dirty} issues={fileIssues}
            words={{ labels, cites }} editor={editor} extensions={history.extensions} blameButton={history.blameButton}
            onChange={edit} onSave={saveNow} onBuild={build} onToPdf={toPdf} />}
          right={<PdfPane cluster={cluster} main={main} pdf={pdf} progress={progress} build={builder}
            logsOpen={logsOpen} onLogs={setLogsOpen} reader={view === 'reader'} target={target} focused={focused}
            onFocus={setFocused} onSync={fromPdf} onGo={goIssue} latex={latexSource} />} />
      </div>
      {history.pane}
      {dialog}
      {nodeFirst.dialog}
      {history.overlay}
      {openIn && <OpenDialog name={project.name} cluster={cluster} clusterName={project.cluster_name} folder={folder}
        onClose={() => setOpenIn(false)} />}
    </div>
  )
}
