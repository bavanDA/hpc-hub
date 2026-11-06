// One LaTeX project, like Overleaf: files on the left, the editor, and the PDF with its logs on the right.
// Saves go to the cluster; Recompile runs latexmk there; double-clicks jump between the PDF and the source.
import { ArrowRight, BookOpenText, Columns2, FileText, FolderOpen, PanelLeft, ScrollText, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { useEvent } from '../../hooks'
import { call } from '../../rpc'
import type { BuildDone, Issue, Opened, PdfInfo, Settings, SourceSpot, Spot } from '../../types/latex'
import { useAskForNode } from '../clusters/AskForNode'
import { ConfirmDialog, NameDialog } from '../files/dialogs'
import { ImageDialog } from '../files/ImageDialog'
import { type PdfTarget } from '../pdf'
import { PdfDialog } from '../pdf/PdfDialog'
import { readFile } from '../pdf/load'
import { ReadablePdf } from '../pdf/ReadAloud'
import { useToast } from '../toast'
import { OpenDialog } from '../tools/OpenDialog'
import { Spinner } from '../ui'
import { basename, ext, IMAGE_EXT, rel, TEXT_EXT } from './bits'
import { Split } from './ui/Split'
import { BuildButton } from './BuildButton'
import type { EditorHandle } from './CodeEditor'
import { FileTree, type TreeActions } from './files/FileTree'
import { GitMenu } from './git/GitMenu'
import { useHistoryTab } from './history/useHistoryTab'
import { counts, Logs } from './Logs'

const CodeEditor = lazy(() => import('./CodeEditor'))
type View = 'editor' | 'split' | 'pdf' | 'reader' | 'history'
type Doc = { path: string; text: string; version: number; line?: number }
type PdfState = { data: Uint8Array | null; path?: string; none?: boolean; error?: string }

function remembered<T extends string>(key: string, fallback: T): T {
  try { return (localStorage.getItem(key) as T) || fallback } catch { return fallback }
}
function remember(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* private window */ }
}

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
  const [running, setRunning] = useState<string | null>(null)
  const [log, setLog] = useState('')
  const [last, setLast] = useState<BuildDone | null>(null)
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
  const runningRef = useRef(running)
  runningRef.current = running
  const logs = useRef<Record<string, string>>({})  // log text by build id, also before we know our id
  const close = useCallback(() => setDialog(null), [])
  const abs = (r: string) => r ? `${folder}/${r}` : folder

  const setView = (v: View) => { setViewState(v); remember('latex.view', v) }

  // -- files ---------------------------------------------------------------------------------
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
      .then((r) => [...r.text.matchAll(/@\w+\s*\{\s*([^,\s]+)\s*,/g)].map((m) => m[1])).catch(() => [])))
      .then((keys) => setCites(keys.flat()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, tree])

  // -- build -----------------------------------------------------------------------------------
  const finish = useCallback((d: BuildDone) => {
    delete logs.current[d.id]
    setRunning(null)
    setLast(d)
    setLog(d.log)
    const { errors, warnings } = counts(d.issues)
    if (d.ok) {
      loadPdf()
      toast(warnings ? `Compiled with ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : 'Compiled')
    } else if (!d.stopped) {
      setLogsOpen(true)
      toast(errors ? `Build failed with ${errors} ${errors === 1 ? 'error' : 'errors'}` : 'Build failed, see the log')
    }
  }, [loadPdf, toast])

  const runBuild = async () => {
    if (runningRef.current || !(await save())) return
    setLog('')
    setRunning('starting')
    try {
      const r = await call<{ id: string; done?: BuildDone }>('latex.build', { cluster, main })
      if (r.done) { finish(r.done); return }
      setRunning(r.id)
      setLog(logs.current[r.id] ?? '')
    } catch (e) {
      setRunning(null)
      toast(`Could not build: ${(e as Error).message}`)
    }
  }
  // "Build on my compute node" with none yet would build on the login node: ask first
  const build = () => {
    if (runningRef.current) return
    if (settings.on_node) nodeFirst.guard(cluster, 'The PDF build', runBuild)
    else void runBuild()
  }
  useEvent<{ id: string; text: string }>('latex-log', ({ id, text: t }) => {
    logs.current[id] = (logs.current[id] ?? '') + t
    if (id === runningRef.current) setLog(logs.current[id])
  })
  useEvent<BuildDone>('latex-build', (d) => {
    if (d.cluster === cluster && d.main === main) finish(d)
  })

  const saveNow = async () => { if (await save() && auto) build() }

  // -- SyncTeX -------------------------------------------------------------------------------------
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
    // the log names a file as given to \input: "results.tex" or "sections/results.tex"
    const same = (path: string) => path === i.file || path.endsWith(`/${i.file}`) || basename(path) === i.file
    const files = tree.filter((e) => e.kind === 'f')
    const hit = !i.file ? rel(folder, main) : docRef.current && same(rel(folder, docRef.current.path))
      ? rel(folder, docRef.current.path) : files.find((e) => same(e.path))?.path
    if (!hit) { toast(`${i.file} is not in the project`); return }
    if (view === 'pdf') setView('split')
    switchTo(abs(hit), i.line || 1)
  }

  // -- the tree's actions ------------------------------------------------------------------------
  const failed = (e: Error) => toast(`Failed: ${e.message}`)
  const moved = (from: string, to: string) => {
    const d = docRef.current
    if (d && (d.path === from || d.path.startsWith(from + '/'))) {
      setDoc({ ...d, path: to + d.path.slice(from.length) })
    }
    if (main === from || main.startsWith(from + '/')) setMain(to + main.slice(from.length))
  }
  const actions: TreeActions = {
    open: (r) => {
      const x = ext(r), p = abs(r)
      if (IMAGE_EXT.includes(x)) setDialog(<ImageDialog cluster={cluster} path={p} onClose={close} />)
      else if (x === '.pdf') setDialog(<PdfDialog cluster={cluster} path={p} subtitle={r} onClose={close} />)
      else if (TEXT_EXT.includes(x)) switchTo(p)
      else toast(`${basename(r)} can't be opened here`)
    },
    move: (r, into) => call<string>('latex.move', { ...where, path: abs(r), into: abs(into) })
      .then((to) => { moved(abs(r), to); refresh(); toast(`Moved ${basename(r)} to ${into || 'the top folder'}`) })
      .catch(failed),
    newFile: (into) => setDialog(<NameDialog title={`New file in ${into || 'the top folder'}`} action="Create"
      initial="" onClose={close} onDone={(name) => call<string>('latex.new_file', { ...where, into: abs(into), name })
        .then((p) => { refresh(); if (TEXT_EXT.includes(ext(p))) switchTo(p) }).catch(failed)} />),
    newFolder: (into) => setDialog(<NameDialog title={`New folder in ${into || 'the top folder'}`} action="Create"
      onClose={close} onDone={(name) => call('latex.mkdir', { ...where, into: abs(into), name })
        .then(() => { refresh(); toast(`Created ${name}`) }).catch(failed)} />),
    rename: (r) => setDialog(<NameDialog title={`Rename ${basename(r)}`} action="Rename" initial={basename(r)}
      onClose={close} onDone={(name) => call<string>('latex.rename', { ...where, path: abs(r), name })
        .then((to) => { moved(abs(r), to); refresh(); toast(`Renamed to ${name}`) }).catch(failed)} />),
    remove: (r) => setDialog(<ConfirmDialog title={`Delete ${basename(r)}?`} action="Delete" onClose={close}
      text={`It is removed from ${project.cluster_name}${tree.some((e) => e.path === r && e.kind === 'd')
        ? ' with everything inside.' : '.'}`}
      onYes={() => call('latex.delete', { ...where, path: abs(r) }).then(() => {
        refresh()
        toast(`Deleted ${basename(r)}`)
        const d = docRef.current
        if (d && (d.path === abs(r) || d.path.startsWith(abs(r) + '/'))) load(main)
      }).catch(failed)} />),
    setMain: (r) => call('latex.set_main', { ...where, main: abs(r) })
      .then(() => { setMain(abs(r)); toast(`Main file: ${basename(r)}`) }).catch(failed),
    copyPath: (r) => navigator.clipboard.writeText(abs(r)).then(() => toast(`Copied ${abs(r)}`))
      .catch(() => toast('Could not copy')),
    refresh,
  }

  // The History tab (why each change happened, in the LaTeX and the PDF), Who changed it, and safe Push and Pull
  const inHistory = view === 'history'
  const history = useHistoryTab({ where, clusterName: project.cluster_name, main, pdf: pdf.data, docPath: doc?.path ?? null,
    docVersion: doc?.version ?? 0, dirty, active: inHistory, save, build, toPdf,
    show: (on) => setView(on ? 'history' : 'split'),
    guard: (what, run) => settings.on_node ? nodeFirst.guard(cluster, what, run) : run(),
    agentGuard: (detail, run) => nodeFirst.guard(cluster, 'The agent', run, detail),
    nodeWaiting: nodeFirst.waiting === 'The agent',
    toPage: (page) => { setLogsOpen(false); setTarget({ page, x: 0, y: 0, n: Date.now() }) },
    selection: () => editor.current?.selection() ?? null,
    reload: () => { refresh(); loadPdf(); const d = docRef.current; if (d) load(d.path, editor.current?.line()) },
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
  const fileIssues = useMemo(() => (last?.issues ?? []).filter((i) => doc && (i.file ? basename(doc.path) === i.file
    : doc.path === main)), [last, doc, main])
  const labels = useMemo(() => doc ? [...doc.text.matchAll(/\\label\{([^}]+)\}/g)].map((m) => m[1]) : [], [doc])
  const { errors, warnings } = counts(last?.issues ?? [])

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
          : !doc ? <div className="grid h-full place-items-center"><Spinner size={24} /></div>
          : <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={24} /></div>}>
              <CodeEditor key={`${doc.path}:${doc.version}`} path={doc.path} version={doc.version} text={doc.text}
                line={doc.line} issues={fileIssues} words={{ labels, cites }} handle={editor}
                onChange={(t) => { text.current = t; if (!dirty) setDirty(true) }}
                onSave={saveNow} onBuild={build} onToPdf={toPdf} extensions={history.extensions} />
            </Suspense>}
      </div>
    </div>
  )

  const logsButton = (
    <button onClick={() => setLogsOpen(!logsOpen)} title="Logs and issues"
      className={`flex h-7 items-center gap-1.5 rounded-md px-2 text-sm ${logsOpen ? 'bg-selected' : 'hover:bg-hover'}`}>
      <ScrollText size={14} />
      {errors > 0 && <span className="rounded-full bg-bad px-1.5 text-xs font-semibold text-white">{errors}</span>}
      {warnings > 0 && <span className="rounded-full bg-warn px-1.5 text-xs font-semibold text-white
        dark:text-black">{warnings}</span>}
    </button>
  )
  const source = pdf.path ? { cluster, path: pdf.path } : undefined
  const latexSource = useMemo(() => ({ cluster, main }), [cluster, main])
  const pdfPane = logsOpen && view !== 'reader'
    ? <Logs running={!!running} log={log} last={last} onGo={goIssue} onClose={() => setLogsOpen(false)}
        onStop={() => running && running !== 'starting' && call('latex.stop', { id: running })} />
    : <ReadablePdf data={pdf.data} source={source} memory={`latex:${cluster}:${main}`} onSync={fromPdf} target={target}
        extra={logsButton} focus={focused} onFocus={setFocused} reflow={view === 'reader'} latex={latexSource}
        loading={!pdf.none && !pdf.error} progress={progress}
        message={pdf.none ? <Empty title="No PDF yet" text="Press Recompile to build it on the cluster." />
          : pdf.error ? <Empty title="Could not read the PDF" text={pdf.error} /> : undefined} />

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
        <div role="radiogroup" aria-label="Show" className="flex gap-[3px] rounded-lg border border-line-strong p-[3px]">
          {([['editor', 'Editor', FileText], ['split', 'Both', Columns2], ['pdf', 'PDF', ScrollText],
            ['reader', 'Reader', BookOpenText]] as const)
            .map(([v, label, I]) => (
              <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)} title={label}
                className={`flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm ${view === v
                  ? 'bg-accent font-semibold text-on-accent' : 'text-dim hover:bg-hover hover:text-text'}`}>
                <I size={14} /> {label}</button>
            ))}
          {history.tab}
        </div>
        <div className="flex flex-1 items-center justify-end gap-1.5">
          <BuildButton cluster={cluster} clusterName={project.cluster_name} running={!!running} settings={settings}
            onSettings={setSettings} auto={auto} onAuto={(on) => { setAuto(on); remember('latex.auto', on ? '1' : '0') }}
            onBuild={build} />
          <GitMenu where={where} before={save} safe={history} onPulled={() => { refresh(); if (doc) load(doc.path,
            editor.current?.line()) }} />
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

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex max-w-xs flex-col items-center gap-2">
      <ScrollText size={40} strokeWidth={1.25} className="text-dim" />
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-dim">{text}</p>
    </div>
  )
}
