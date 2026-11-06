import { ArrowRight, FileText, FolderOpen, PanelLeft, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { call } from '../../rpc'
import type { BuildDone, Issue, Opened, PdfInfo, Settings, SourceSpot, Spot } from '../../types/latex'
import { useAskForNode } from '../clusters/AskForNode'
import { type PdfTarget } from '../pdf'
import { readFile } from '../pdf/load'
import { ReadablePdf } from '../pdf/ReadAloud'
import { useToast } from '../toast'
import { OpenDialog } from '../tools/OpenDialog'
import { Spinner } from '../ui'
import { basename, rel } from './bits'
import { BuildButton } from './BuildButton'
import type { EditorHandle } from './editor/CodeEditor'
import { FileTree } from './files/FileTree'
import { useTreeActions } from './files/useTreeActions'
import { GitMenu } from './git/GitMenu'
import { useHistoryTab } from './history/useHistoryTab'
import { bibKeys, buildMessage, counts, issueFile, issuesIn, labels as labelsIn } from './issues'
import { Logs } from './Logs'
import { LogsButton } from './LogsButton'
import { PdfMessage } from './PdfMessage'
import { remember, remembered } from './storage'
import { Split } from './ui/Split'
import { useBuild } from './useBuild'
import { ViewSwitch, type View } from './ViewSwitch'

const CodeEditor = lazy(() => import('./editor/CodeEditor'))
type Doc = { path: string; text: string; version: number; line?: number }
type PdfState = { data: Uint8Array | null; path?: string; none?: boolean; error?: string }

const centered = <div className="grid h-full place-items-center"><Spinner size={24} /></div>

export function Project({ project, onClose }: { project: Opened; onClose: () => void }) {
  const toast = useToast()
  const nodeFirst = useAskForNode()
  const { cluster, folder } = project
  const where = useMemo(() => ({ cluster, folder }), [cluster, folder])
  const [main, setMain] = useState(project.main)
  const [tree, setTree] = useState(project.tree)
  const [settings, setSettings] = useState<Settings>(project.settings)
  const [doc, setDoc] = useState<Doc | null>(null)
  const [docError, setDocError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdf, setPdf] = useState<PdfState>({ data: null })
  const [progress, setProgress] = useState(0)
  const [logsOpen, setLogsOpen] = useState(false)
  const [view, setViewState] = useState<View>(() => remembered('latex.view', 'split'))
  const [showTree, setShowTree] = useState(() => remembered<string>('latex.tree', '1') === '1')
  const [auto, setAuto] = useState(() => remembered<string>('latex.auto', '0') === '1')
  const [target, setTarget] = useState<PdfTarget | null>(null)
  const [dialog, setDialog] = useState<ReactNode>(null)
  const [cites, setCites] = useState<string[]>([])
  const [openIn, setOpenIn] = useState(false)
  const [focused, setFocused] = useState(false)  // Just the PDF: this header, the files and the editor hide
  const editor = useRef<EditorHandle | null>(null)
  const text = useRef('')
  const docRef = useRef(doc)
  docRef.current = doc
  const abs = (r: string) => r ? `${folder}/${r}` : folder

  const setView = (v: View) => { setViewState(v); remember('latex.view', v) }

  const load = useCallback((path: string, line?: number) => {
    setDocError('')
    call<{ text: string }>('latex.read', { cluster, path })
      .then(({ text: t }) => {
        text.current = t
        setDoc((d) => ({ path, text: t, version: (d?.version ?? 0) + 1, line }))
        setDirty(false)
      })
      .catch((e: Error) => { setDocError(e.message); setDoc(null) })
  }, [cluster])

  const save = useCallback(async (): Promise<boolean> => {
    const d = docRef.current
    if (!d || !dirty) return true
    setSaving(true)
    try {
      await call('latex.write', { cluster, path: d.path, text: text.current })
      setDirty(false)
      return true
    } catch (e) {
      toast(`Could not save: ${(e as Error).message}`)
      return false
    } finally { setSaving(false) }
  }, [cluster, dirty, toast])

  const switchTo = async (path: string, line?: number) => {
    if (docRef.current?.path === path) { if (line) editor.current?.goto(line); return }
    if (await save()) load(path, line)
  }
  const reloadDoc = () => { const d = docRef.current; if (d) load(d.path, editor.current?.line()) }

  const refresh = useCallback(() => {
    call<typeof tree>('latex.tree', where).then(setTree).catch((e: Error) => toast(e.message))
  }, [where, toast])

  const loadPdf = useCallback(() => {
    setProgress(0)
    call<PdfInfo | null>('latex.pdf', { cluster, main })
      .then((info) => info ? readFile(cluster, info.path, setProgress).then((data) => setPdf({ data, path: info.path }))
        : setPdf({ data: null, none: true }))
      .catch((e: Error) => setPdf({ data: null, error: e.message }))
  }, [cluster, main])

  useEffect(() => { load(project.main) }, [load, project.main])
  useEffect(loadPdf, [loadPdf])
  useEffect(() => {  // citation keys for completion
    const bibs = tree.filter((e) => e.kind === 'f' && e.path.endsWith('.bib'))
    Promise.all(bibs.map((b) => call<{ text: string }>('latex.read', { cluster, path: abs(b.path) })
      .then((r) => bibKeys(r.text)).catch(() => [])))
      .then((keys) => setCites(keys.flat()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, tree])

  const built = (d: BuildDone) => {
    if (d.ok) loadPdf()
    else if (!d.stopped) setLogsOpen(true)
    const message = buildMessage(d)
    if (message) toast(message)
  }
  // "Build on my compute node" with none yet would build on the login node: ask first
  const builder = useBuild({ cluster, main, save, onDone: built,
    guard: (run) => settings.on_node ? nodeFirst.guard(cluster, 'The PDF build', run) : run() })
  const { build, running, last } = builder

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
    switchTo(abs(hit), i.line || 1)
  }

  const under = (path: string, top: string) => path === top || path.startsWith(top + '/')
  const actions = useTreeActions({ cluster, folder, clusterName: project.cluster_name, tree, refresh,
    dialog: setDialog, setMain, edit: (p) => void switchTo(p),
    moved: (from, to) => {
      const d = docRef.current
      if (d && under(d.path, from)) setDoc({ ...d, path: to + d.path.slice(from.length) })
      if (under(main, from)) setMain(to + main.slice(from.length))
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

  // Ctrl+S, Ctrl+Enter and Ctrl+J also work outside the editor
  const keys = useRef({ saveNow, build, toPdf })
  keys.current = { saveNow, build, toPdf }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === 's') { e.preventDefault(); keys.current.saveNow() }
      else if (k === 'enter' || k === 'b') { e.preventDefault(); keys.current.build() }
      else if (k === 'j' && editor.current) { e.preventDefault(); keys.current.toPdf(editor.current.line()) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])

  const docRel = doc ? rel(folder, doc.path) : ''
  const fileIssues = useMemo(() => doc ? issuesIn(last?.issues ?? [], doc.path, main) : [], [last, doc, main])
  const labels = useMemo(() => doc ? labelsIn(doc.text) : [], [doc])
  const { errors, warnings } = counts(last?.issues ?? [])
  const latexSource = useMemo(() => ({ cluster, main }), [cluster, main])

  const editorPane = (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-line bg-header pl-3 pr-1.5 text-sm">
        <FileText size={14} className="shrink-0 text-dim" />
        <span className="truncate font-semibold" title={doc?.path}>{docRel || basename(main)}</span>
        {dirty && <span className="size-2 shrink-0 rounded-full bg-accent" title="Not saved yet" />}
        <span className="flex-1" />
        {history.blameButton}
        <button onClick={() => editor.current && toPdf(editor.current.line())} title="Show this line in the PDF (Ctrl+J)"
          className="flex h-7 items-center gap-1 rounded-md px-2 text-dim hover:bg-hover hover:text-text">
          To PDF <ArrowRight size={14} /></button>
      </div>
      <div className="min-h-0 flex-1">
        {docError ? <p className="p-6 text-center text-sm text-bad">{docError}</p>
          : !doc ? centered
          : <Suspense fallback={centered}>
              <CodeEditor key={`${doc.path}:${doc.version}`} path={doc.path} version={doc.version} text={doc.text}
                line={doc.line} issues={fileIssues} words={{ labels, cites }} handle={editor}
                onChange={(t) => { text.current = t; if (!dirty) setDirty(true) }}
                onSave={saveNow} onBuild={build} onToPdf={toPdf} extensions={history.extensions} />
            </Suspense>}
      </div>
    </div>
  )

  const pdfPane = logsOpen && view !== 'reader'
    ? <Logs running={running} log={builder.log} last={last} onGo={goIssue} onClose={() => setLogsOpen(false)}
        onStop={builder.stop} />
    : <ReadablePdf data={pdf.data} source={pdf.path ? { cluster, path: pdf.path } : undefined}
        memory={`latex:${cluster}:${main}`} onSync={fromPdf} target={target}
        extra={<LogsButton open={logsOpen} errors={errors} warnings={warnings} onClick={() => setLogsOpen(!logsOpen)} />}
        focus={focused} onFocus={setFocused} reflow={view === 'reader'} latex={latexSource}
        loading={!pdf.none && !pdf.error} progress={progress}
        message={pdf.none ? <PdfMessage title="No PDF yet" text="Press Recompile to build it on the cluster." />
          : pdf.error ? <PdfMessage title="Could not read the PDF" text={pdf.error} /> : undefined} />

  return (
    <div className="flex h-full flex-col bg-window">
      <div className={`flex h-12 shrink-0 items-center gap-2 border-b border-line bg-window px-2 ${focused ? 'hidden' : ''}`}>
        <button onClick={() => { setShowTree(!showTree); remember('latex.tree', showTree ? '0' : '1') }}
          aria-label="Show or hide the files" title="Show or hide the files"
          className={`grid size-8 place-items-center rounded-md ${showTree ? 'bg-selected' : 'hover:bg-hover'}`}>
          <PanelLeft size={16} /></button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-base font-semibold">{project.name}</div>
          <div className="truncate text-xs text-dim">{project.cluster_name} · {rel(folder, main)}
            <span className="ml-2">{saving ? 'Saving…' : dirty ? 'Not saved' : 'Saved'}</span></div>
        </div>
        <ViewSwitch view={view} onView={setView} more={history.tab} />
        <div className="flex flex-1 items-center justify-end gap-1.5">
          <BuildButton cluster={cluster} clusterName={project.cluster_name} running={running} settings={settings}
            onSettings={setSettings} auto={auto} onAuto={(on) => { setAuto(on); remember('latex.auto', on ? '1' : '0') }}
            onBuild={build} />
          <GitMenu where={where} before={save} safe={history} onPulled={() => { refresh(); reloadDoc() }} />
          <button onClick={() => setOpenIn(true)} title="Open the folder in Code, VS Code, an agent and more"
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold hover:bg-hover">
            <FolderOpen size={16} /> Open</button>
          <button onClick={async () => { if (await save()) onClose() }} aria-label="Close project"
            title="Close project" className="grid size-8 place-items-center rounded-md hover:bg-hover"><X size={16} /></button>
        </div>
      </div>
      <div className={`flex min-h-0 flex-1 ${inHistory ? 'hidden' : ''}`}>
        {showTree && !focused && <div className="w-[236px] shrink-0 border-r border-line">
          <FileTree id={`${cluster}:${folder}`} entries={tree} current={docRel} main={rel(folder, main)}
            actions={actions} /></div>}
        <Split name="editor" show={focused ? 'right' : view === 'split' ? 'both' : view === 'editor' ? 'left' : 'right'}
          left={editorPane} right={pdfPane} />
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
