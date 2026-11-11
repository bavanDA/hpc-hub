// One open paper on the phone: the desktop's project, one view at a time under its project bar (Editor, PDF, Reader,
// History). Saving, building, the PDF and the history use the desktop's hooks (components/latex); a double-tap in the
// PDF jumps to the source line, and To PDF goes the other way (SyncTeX). Errors in the log jump to their line.
import './reader.css'

import type { Extension } from '@codemirror/state'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { Save, StickyNote } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'

import type { EditorHandle as KeyHandle } from '@shared/components/code/Editor'
import { detect } from '@shared/components/code/languages'
import { basename, ext, inFolder, moved as movedPath, rel, TEXT_EXT, under } from '@shared/components/latex/bits'
import type { EditorHandle } from '@shared/components/latex/editor/CodeEditor'
import { fileName } from '@shared/components/latex/history/format'
import type { Go } from '@shared/components/latex/history/go'
import { notesGutter } from '@shared/components/latex/history/notes/notesGutter'
import { isLine } from '@shared/components/latex/history/notes/places'
import type { CardSpot } from '@shared/components/latex/history/notes/SpotCard'
import { useAssist } from '@shared/components/latex/history/useAssist'
import { RunningCard } from '@shared/components/latex/history/write/RunningCard'
import { buildMessage, counts, issueFile, issuesIn, labels as labelsIn } from '@shared/components/latex/issues'
import { remember, remembered } from '@shared/components/latex/storage'
import { useBuild } from '@shared/components/latex/useBuild'
import { useBuiltPdf } from '@shared/components/latex/useBuiltPdf'
import { useCites } from '@shared/components/latex/useCites'
import { useDoc } from '@shared/components/latex/useDoc'
import type { PdfTarget } from '@shared/components/pdf'
import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui/Spinner'
import { call } from '@shared/rpc'
import type { BuildDone, Issue, Opened, Settings, SourceSpot, Spot, TreeEntry } from '@shared/types/latex'
import { useBackLayer } from '../../nav'
import { Button, Dialog, Row, useToast } from '../../ui'
import { useAskForNode } from '../AskForNode'
import { KeyRow } from '../code/KeyRow'
import { Header } from '../Header'
import { useEditorKeyboard } from '../keyboard'
import { useOpenIn } from '../projects/openIn'
import { BuildDialog } from './BuildDialog'
import { FilesPanel, type FileActions } from './FilesPanel'
import { GitDialog } from './GitDialog'
import { History, type HistoryAsk } from './history/History'
import { SpotDialog } from './history/SpotDialog'
import { LogPane } from './LogPane'
import { PdfPane } from './PdfPane'
import { ProjectBar, type View } from './ProjectBar'

const CodeEditor = lazy(() => import('@shared/components/latex/editor/CodeEditor'))
const centered = <div className="grid h-full place-items-center"><Spinner size={24} /></div>
type Open = 'files' | 'git' | 'build' | 'logs' | 'open' | null
const PAUSED: Extension[] = [EditorState.readOnly.of(true), EditorView.editable.of(false)]

export function Paper({ paper, onClose }: { paper: Opened; onClose: () => void }) {
  const toast = useToast()
  const nodeFirst = useAskForNode()
  const openIn = useOpenIn()
  const keyboard = useEditorKeyboard()
  const { cluster, folder } = paper
  const where = useMemo(() => ({ cluster, folder }), [cluster, folder])
  const [main, setMain] = useState(paper.main)
  const [tree, setTree] = useState<TreeEntry[]>(paper.tree)
  const [settings, setSettings] = useState<Settings>(paper.settings)
  const [auto, setAuto] = useState(() => remembered<string>('latex.auto', '0') === '1')
  const [view, setViewState] = useState<View>(() => remembered<View>('latex.phone.view', 'editor'))
  const [historyOpened, setHistoryOpened] = useState(view === 'history')  // mounted once shown, so it keeps its place
  const [open, setOpen] = useState<Open>(null)
  const [target, setTarget] = useState<PdfTarget | null>(null)
  const [ask, setAsk] = useState<HistoryAsk | null>(null)
  const [paused, setPaused] = useState(false)
  const [assistOpen, setAssistOpen] = useState(false)  // Ask and Notes, in place of the commit list
  const [spot, setSpot] = useState<CardSpot | null>(null)
  const [top, setTop] = useState(0)
  const editor = useRef<EditorHandle | null>(null)
  const editorBox = useRef<HTMLDivElement>(null)
  // KeyRow only needs view(); the desktop's LaTeX editor hands over its handle without one
  const viewOf = (): EditorView | null => {
    const el = editorBox.current?.querySelector('.cm-editor')
    return el instanceof HTMLElement ? EditorView.findFromDOM(el) : null
  }
  const keyHandle = useRef({ view: viewOf } as unknown as KeyHandle)
  keyHandle.current = { view: viewOf } as unknown as KeyHandle
  const { doc, setDoc, docRef, error: docError, dirty, saving, load, save, edit } = useDoc(cluster, paper.main)
  const { pdf, progress, reload: loadPdf } = useBuiltPdf(cluster, main)
  const cites = useCites(cluster, folder, tree)

  const setView = (v: View) => {
    if (v !== 'history') setAssistOpen(false)
    if (v === 'history' && view === 'history') setTop((n) => n + 1)
    if (v === 'history') setHistoryOpened(true)
    setViewState(v)
    remember('latex.phone.view', v)
  }

  const dismissKeyboard = () => setTimeout(() => {
    const a = document.activeElement
    if (a instanceof HTMLElement && a.closest('.cm-editor')) a.blur()
  })
  const switchTo = async (path: string, line?: number) => {
    if (docRef.current?.path === path) { if (line) { editor.current?.goto(line); dismissKeyboard() } return }
    if (await save()) load(path, line)
  }
  const reloadDoc = () => { const d = docRef.current; if (d) load(d.path, editor.current?.line()) }
  const refresh = useCallback(() => {
    call<TreeEntry[]>('latex.tree', where).then(setTree).catch((e: Error) => toast(e.message))
  }, [where, toast])

  const built = (d: BuildDone) => {
    if (d.ok) loadPdf()
    else if (!d.stopped) setOpen('logs')
    const message = buildMessage(d)
    if (message) toast(message)
  }
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
        setView('pdf')
        setTarget({ ...s, n: Date.now() })
      })
      .catch((e: Error) => toast(e.message))
  }
  const fromPdf = (page: number, x: number, y: number) => {
    call<SourceSpot | null>('latex.sync_edit', { cluster, main, page, x, y })
      .then((s) => {
        if (!s) { toast('No source for that spot'); return }
        setView('editor')
        void switchTo(s.path, s.line)
      })
      .catch((e: Error) => toast(e.message))
  }
  const goIssue = (i: Issue) => {
    const files = tree.filter((e) => e.kind === 'f').map((e) => e.path)
    const hit = issueFile(i, files, folder, main, docRef.current?.path ?? null)
    if (!hit) { toast(`${i.file} is not in the project`); return }
    setOpen(null)
    setView('editor')
    void switchTo(inFolder(folder, hit), i.line || 1)
  }

  // -- the agent and the notes: the desktop's hook, Ask and Notes in the History tab ---------------------------------
  const send = (kind: HistoryAsk['kind'], hash?: string) => {
    setAsk({ kind, hash, n: Date.now() })
    setView('history')
  }
  const assist = useAssist({ where, clusterName: paper.cluster_name,
    guard: (detail, run) => nodeFirst.guard(cluster, 'The agent', run, detail), waiting: nodeFirst.waiting === 'The agent',
    inHistory: view === 'history', showHistory: () => send('now') })
  const root = assist.notes?.root ?? ''
  const docRel = doc ? rel(folder, doc.path) : ''
  const repoRel = doc && root && doc.path.startsWith(root + '/') ? doc.path.slice(root.length + 1) : ''
  const notes = assist.notes?.notes
  const pins = useMemo(() => (notes ?? []).filter((n) => isLine(n.place) && n.place.path === repoRel && !n.done)
    .map((n) => ({ id: n.id, n: n.n, done: n.done, text: n.text, line: (n.place as { line: number }).line })), [notes, repoRel])
  const showNote = useRef((id: string) => send('notes', id))
  showNote.current = (id: string) => send('notes', id)
  const extensions = useMemo(() => [...(paused ? PAUSED : []),
    ...(pins.length ? [notesGutter(pins, (id) => showNote.current(id))] : [])], [paused, pins])
  const go: Go = {
    line: (path, line) => { setView('editor'); void switchTo(root ? `${root}/${path}` : path, line) },
    page: (page) => { setView('pdf'); setTarget({ page, x: 0, y: 0, n: Date.now() }) },
  }
  // Ask about or note the selected text, or the line the cursor is on
  const fromEditor = (mode: CardSpot['mode']) => {
    const s = editor.current?.selection()
    if (!s || !repoRel) return
    const lines = s.from === s.to ? `line ${s.from}` : `lines ${s.from} to ${s.to}`
    setSpot({ id: `ed-${Date.now()}`, mode, title: s.text ? `the selected text in ${fileName(repoRel)}` : `${fileName(repoRel)}, ${lines}`,
      about: { kind: 'lines', path: repoRel, line: s.from, end: s.to, text: s.text || undefined },
      place: { path: repoRel, line: s.from }, here: repoRel })
  }

  // -- the files panel's actions --------------------------------------------------------------------------------------
  const failed = (e: Error) => toast(e.message)
  const movedTo = (from: string, to: string) => {
    const d = docRef.current
    const path = d ? movedPath(d.path, from, to) : null
    if (d && path !== null) setDoc({ ...d, path })
    const m = movedPath(main, from, to)
    if (m !== null) setMain(m)
  }
  const abs = (r: string) => inFolder(folder, r)
  const files: FileActions = {
    open: (r) => {
      if (TEXT_EXT.includes(ext(r))) { setView('editor'); void switchTo(abs(r)) }
      else toast(`Open ${basename(r)} from Files`)
    },
    newFile: (into, name) => call<string>('latex.new_file', { ...where, into: abs(into), name })
      .then((p) => { refresh(); if (TEXT_EXT.includes(ext(p))) { setView('editor'); void switchTo(p) } }).catch(failed),
    newFolder: (into, name) => call('latex.mkdir', { ...where, into: abs(into), name })
      .then(() => { refresh(); toast(`Created ${name}`) }).catch(failed),
    rename: (r, name) => call<string>('latex.rename', { ...where, path: abs(r), name })
      .then((to) => { movedTo(abs(r), to); refresh(); toast(`Renamed to ${name}`) }).catch(failed),
    remove: (r) => call('latex.delete', { ...where, path: abs(r) }).then(() => {
      refresh()
      toast(`Deleted ${basename(r)}`)
      const d = docRef.current
      if (d && under(d.path, abs(r))) load(main)
    }).catch(failed),
    setMain: (r) => call('latex.set_main', { ...where, main: abs(r) })
      .then(() => { setMain(abs(r)); toast(`Main file: ${basename(r)}`) }).catch(failed),
    copyPath: (r) => void copyText(abs(r)).then((ok) => toast(ok ? `Copied ${abs(r)}` : 'Could not copy')),
    refresh,
  }

  const leave = async () => { if (await save()) onClose() }
  useBackLayer(() => { void leave() })

  useEffect(() => { if (doc?.line) dismissKeyboard() }, [doc?.path, doc?.version])  // a jump opens without the keyboard
  const fileIssues = useMemo(() => doc ? issuesIn(last?.issues ?? [], doc.path, main) : [], [last, doc, main])
  const labels = useMemo(() => doc ? labelsIn(doc.text) : [], [doc])
  const lang = doc ? detect(doc.path).id : 'latex'
  const { errors, warnings } = counts(last?.issues ?? [])
  const status = saving ? 'Saving' : dirty ? 'Not saved' : 'Saved'
  const showEditor = view === 'editor' || view === 'split'
  const showPdf = view === 'pdf' || view === 'reader' || view === 'split'
  const latex = useMemo(() => ({ cluster, main }), [cluster, main])
  // while you are in History the button or the notes show it; elsewhere a card says it is running
  const running = view === 'history' ? [] : assist.jobs.filter((j) => ['starting', 'preparing', 'running'].includes(j.stage)
    && (j.kind !== 'ask' || j.ask?.scope !== 'card'))

  return (
    <div className="flex h-full flex-col">
      {!keyboard && <Header title="Papers" />}
      {!keyboard && <ProjectBar name={paper.name} where={`${paper.cluster_name} · ${rel(folder, main)}`} status={status}
        view={view} onView={setView} running={builder.running} onBuild={build} onFiles={() => setOpen('files')}
        onBuildSettings={() => setOpen('build')} onLogs={() => setOpen('logs')} logCount={errors + warnings}
        onGit={() => setOpen('git')} onOpen={() => { void save(); setOpen('open') }} onClose={() => void leave()} />}

      <div className="flex min-h-0 flex-1 flex-col">
        <div ref={editorBox} className={`min-h-0 flex-1 flex-col ${showEditor ? 'flex' : 'hidden'}
          ${view === 'split' ? 'border-b border-line' : ''}`}>
          {!keyboard && (
            <div className="flex h-10 shrink-0 items-center gap-0.5 border-b border-line px-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{docRel || basename(main)}</span>
              {dirty && <Button small kind="quiet" icon={Save} onClick={saveNow}>Save</Button>}
              <Button small kind="quiet" disabled={!repoRel} onClick={() => fromEditor('ask')}>Ask</Button>
              <Button small kind="quiet" icon={StickyNote} disabled={!repoRel} onClick={() => fromEditor('note')}>Note</Button>
              <Button small kind="quiet" onClick={() => editor.current && toPdf(editor.current.line())}>To PDF</Button>
            </div>
          )}
          <div className="min-h-0 flex-1">
            {docError ? <p className="p-6 text-center text-sm text-bad">{docError}</p>
              : !doc ? centered
              : <Suspense fallback={centered}>
                  <CodeEditor key={`${doc.path}:${doc.version}`} path={doc.path} version={doc.version} text={doc.text}
                    line={doc.line} issues={fileIssues} words={{ labels, cites }} handle={editor}
                    onChange={edit} onSave={saveNow} onBuild={build} onToPdf={toPdf} extensions={extensions} />
                </Suspense>}
          </div>
          {!keyboard && view === 'editor' && (
            <div className="flex h-7 shrink-0 items-center justify-end gap-3 border-t border-line bg-window px-3 text-xs text-dim">
              <span>{docRel || basename(main)}</span><span>{status}</span></div>
          )}
          {keyboard && <KeyRow lang={lang} editor={keyHandle as RefObject<KeyHandle | null>} />}
        </div>
        {showPdf && <div className="min-h-0 flex-1"><PdfPane data={pdf.data} memory={`latex:${cluster}:${main}`}
          target={target} onSync={fromPdf} loading={!pdf.none && !pdf.error} progress={progress} reflow={view === 'reader'} latex={latex}
          message={pdf.none ? <Empty title="No PDF yet" text="Press Recompile to build it on the cluster." />
            : pdf.error ? <Empty title="Could not read the PDF" text={pdf.error} /> : undefined} /></div>}
        {historyOpened && <div className={view === 'history' ? 'min-h-0 flex-1' : 'hidden'}>
          <History where={where} clusterName={paper.cluster_name} main={main} pdf={pdf.data} active={view === 'history'} ask={ask}
            top={top} guard={(what, run) => settings.on_node ? nodeFirst.guard(cluster, what, run) : run()} onBuild={build}
            onFiles={() => { refresh(); loadPdf(); reloadDoc() }} onPause={setPaused} onSave={save} assist={assist} go={go} onSpot={setSpot}
            assistOpen={assistOpen} onAssist={setAssistOpen}
            onOpen={(path, line) => { setView('editor'); void switchTo(path, line) }} />
        </div>}
      </div>

      {running.length > 0 && <div className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--bottom)+12px)] z-30 flex flex-col gap-2">
        {running.map((j) => <RunningCard key={j.id} job={j} onCancel={() => assist.cancel(j.id)} />)}
      </div>}

      {open === 'files' && <FilesPanel entries={tree} current={docRel} main={rel(folder, main)} actions={files}
        onClose={() => setOpen(null)} />}
      {open === 'git' && <GitDialog where={where} before={save} onClose={() => setOpen(null)}
        onPulled={() => { refresh(); reloadDoc() }}
        safe={{ push: () => send('push'), pull: () => send('pull'), timeline: () => send('timeline') }} />}
      {open === 'build' && <BuildDialog cluster={cluster} clusterName={paper.cluster_name} settings={settings}
        onSaved={setSettings} onClose={() => setOpen(null)} auto={auto}
        onAuto={(on) => { setAuto(on); remember('latex.auto', on ? '1' : '0') }} />}
      {open === 'logs' && <LogPane running={builder.running} log={builder.log} last={last} onGo={goIssue}
        onStop={builder.stop} onClose={() => setOpen(null)} />}
      {open === 'open' && <Dialog title={`Open ${paper.name}`} onClose={() => setOpen(null)}>
        <div className="border-t border-line">
          {openIn({ cluster, clusterName: paper.cluster_name, folder }, toast).map((a) => (
            <Row key={a.label} icon={a.icon} label={a.label} opens onPress={() => { setOpen(null); a.onPick() }} />))}
        </div>
      </Dialog>}
      {spot && <SpotDialog key={spot.id} spot={spot} assist={assist} go={go} onClose={() => setSpot(null)} />}
      {nodeFirst.sheet}
    </div>
  )
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex max-w-xs flex-col items-center gap-2">
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-dim">{text}</p>
    </div>
  )
}
