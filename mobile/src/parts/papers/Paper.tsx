// One open paper on the phone: Source, PDF and Log, one at a time, with the files and Git in full-screen sheets.
// Build saves and runs latexmk on the cluster; a double-tap in the PDF jumps to the source line, and "Show in PDF"
// goes the other way (SyncTeX). Errors in the log jump to their line.
import { ArrowLeft, Check, FileText, FolderOpen, GitBranch, LocateFixed, MoreVertical, Pencil, RefreshCw,
  Save, Settings2, X } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { EditorHandle } from '@shared/components/code/Editor'
import { keyRow } from '@shared/components/code/keys'
import { detect } from '@shared/components/code/languages'
import { basename, ext, rel, TEXT_EXT } from '@shared/components/latex/bits'
import { counts } from '@shared/components/latex/Logs'
import type { PdfTarget } from '@shared/components/pdf'
import { readFile } from '@shared/components/pdf/load'
import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui'
import { useEvent } from '@shared/hooks'
import { call } from '@shared/rpc'
import type { BuildDone, Issue, Opened, PdfInfo, Settings, SourceSpot, Spot, TreeEntry } from '@shared/types/latex'
import { useBackLayer } from '../../nav'
import { ActionSheet, Segments, useToast } from '../../ui'
import { BuildSheet } from './BuildSheet'
import { FilesSheet, type FileActions } from './FilesSheet'
import { GitSheet } from './GitSheet'
import { LogPane } from './LogPane'
import { PdfPane } from './PdfPane'

const Editor = lazy(() => import('@shared/components/code/Editor'))
type Pane = 'source' | 'pdf' | 'log'
type Doc = { path: string; text: string; version: number; line?: number }
type PdfState = { data: Uint8Array | null; none?: boolean; error?: string }
type Open = 'files' | 'git' | 'build' | 'menu' | null

function remembered(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}

export function Paper({ paper, onClose }: { paper: Opened; onClose: () => void }) {
  const toast = useToast()
  const { cluster, folder } = paper
  const where = useMemo(() => ({ cluster, folder }), [cluster, folder])
  const [main, setMain] = useState(paper.main)
  const [tree, setTree] = useState<TreeEntry[]>(paper.tree)
  const [settings, setSettings] = useState<Settings>(paper.settings)
  const [pane, setPane] = useState<Pane>('source')
  const [doc, setDoc] = useState<Doc | null>(null)
  const [docError, setDocError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pdf, setPdf] = useState<PdfState>({ data: null })
  const [progress, setProgress] = useState(0)
  const [running, setRunning] = useState<string | null>(null)
  const [log, setLog] = useState('')
  const [last, setLast] = useState<BuildDone | null>(null)
  const [target, setTarget] = useState<PdfTarget | null>(null)
  const [open, setOpen] = useState<Open>(null)
  const [auto, setAuto] = useState(() => remembered('latex.auto'))
  const editor = useRef<EditorHandle | null>(null)
  const docRef = useRef(doc)
  docRef.current = doc
  const runningRef = useRef(running)
  runningRef.current = running
  const logs = useRef<Record<string, string>>({})  // log text by build id, also before we know our id
  const abs = (r: string) => r ? `${folder}/${r}` : folder

  // -- the open file ------------------------------------------------------------------------------
  const load = useCallback((path: string, line?: number) => {
    setDocError('')
    call<{ text: string }>('latex.read', { cluster, path })
      .then(({ text }) => {
        setDoc((d) => ({ path, text, version: (d?.version ?? 0) + 1, line }))
        setDirty(false)
        setEditing(false)  // a new document opens in view mode
      })
      .catch((e: Error) => { setDocError(e.message); setDoc(null) })
  }, [cluster])

  const save = useCallback(async (): Promise<boolean> => {
    const d = docRef.current
    if (!d || !dirty || !editor.current) return true
    setSaving(true)
    try {
      await call('latex.write', { cluster, path: d.path, text: editor.current.text() })
      setDirty(false)
      return true
    } catch (e) {
      toast(`Couldn't save: ${(e as Error).message}`)
      return false
    } finally { setSaving(false) }
  }, [cluster, dirty, toast])

  const switchTo = async (path: string, line?: number) => {
    setPane('source')
    if (docRef.current?.path === path) { if (line) setTimeout(() => editor.current?.goto(line)); return }
    if (await save()) load(path, line)
  }

  const refresh = useCallback(() => {
    call<TreeEntry[]>('latex.tree', where).then(setTree).catch((e: Error) => toast(e.message))
  }, [where, toast])

  const loadPdf = useCallback(() => {
    setProgress(0)
    call<PdfInfo | null>('latex.pdf', { cluster, main })
      .then((info) => info ? readFile(cluster, info.path, setProgress).then((data) => setPdf({ data }))
        : setPdf({ data: null, none: true }))
      .catch((e: Error) => setPdf({ data: null, error: e.message }))
  }, [cluster, main])

  useEffect(() => { load(paper.main) }, [load, paper.main])
  useEffect(loadPdf, [loadPdf])

  // -- build ------------------------------------------------------------------------------------------
  const finish = useCallback((d: BuildDone) => {
    delete logs.current[d.id]
    setRunning(null)
    setLast(d)
    setLog(d.log)
    const { errors, warnings } = counts(d.issues)
    if (d.ok) {
      loadPdf()
      toast(warnings ? `Built, with ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : 'Built')
    } else if (!d.stopped) {
      setPane('log')
      toast(errors ? `The build failed with ${errors} ${errors === 1 ? 'error' : 'errors'}` : 'The build failed')
    }
  }, [loadPdf, toast])

  const build = async () => {
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
      toast(`Couldn't build: ${(e as Error).message}`)
    }
  }
  useEvent<{ id: string; text: string }>('latex-log', ({ id, text }) => {
    logs.current[id] = (logs.current[id] ?? '') + text
    if (id === runningRef.current) setLog(logs.current[id])
  })
  useEvent<BuildDone>('latex-build', (d) => { if (d.cluster === cluster && d.main === main) finish(d) })
  const stop = () => { if (running && running !== 'starting') call('latex.stop', { id: running }).catch(() => {}) }
  const saveNow = async () => { if (await save()) { if (auto) build(); else toast('Saved') } }

  // -- SyncTeX and the log's issues ------------------------------------------------------------------
  const toPdf = () => {
    const d = docRef.current, line = editor.current?.line()
    if (!d || !line) return
    call<Spot | null>('latex.sync_view', { cluster, main, path: d.path, line })
      .then((s) => {
        if (!s) { toast("This line isn't in the PDF"); return }
        setPane('pdf')
        setTarget({ ...s, n: Date.now() })
      })
      .catch((e: Error) => toast(e.message))
  }
  const fromPdf = (page: number, x: number, y: number) => {
    call<SourceSpot | null>('latex.sync_edit', { cluster, main, page, x, y })
      .then((s) => s ? switchTo(s.path, s.line) : toast('No source for that spot'))
      .catch((e: Error) => toast(e.message))
  }
  const goIssue = (i: Issue) => {
    // the log names a file as given to \input: "results.tex" or "sections/results.tex"
    const same = (path: string) => path === i.file || path.endsWith(`/${i.file}`) || basename(path) === i.file
    const hit = !i.file ? rel(folder, main) : tree.find((e) => e.kind === 'f' && same(e.path))?.path
    if (!hit) { toast(`${i.file} isn't in this paper`); return }
    switchTo(abs(hit), i.line || 1)
  }

  // -- the files sheet's actions ---------------------------------------------------------------------
  const failed = (e: Error) => toast(e.message)
  const moved = (from: string, to: string) => {
    const d = docRef.current
    if (d && (d.path === from || d.path.startsWith(from + '/'))) setDoc({ ...d, path: to + d.path.slice(from.length) })
    if (main === from || main.startsWith(from + '/')) setMain(to + main.slice(from.length))
  }
  const files: FileActions = {
    open: (r) => TEXT_EXT.includes(ext(r)) ? switchTo(abs(r)) : toast(`Open ${basename(r)} from Files`),
    newFile: (into, name) => call<string>('latex.new_file', { ...where, into: abs(into), name })
      .then((p) => { refresh(); if (TEXT_EXT.includes(ext(p))) switchTo(p) }).catch(failed),
    newFolder: (into, name) => call('latex.mkdir', { ...where, into: abs(into), name })
      .then(() => { refresh(); toast(`Made ${name}`) }).catch(failed),
    rename: (r, name) => call<string>('latex.rename', { ...where, path: abs(r), name })
      .then((to) => { moved(abs(r), to); refresh() }).catch(failed),
    remove: (r) => call('latex.delete', { ...where, path: abs(r) }).then(() => {
      refresh()
      toast(`Deleted ${basename(r)}`)
      const d = docRef.current
      if (d && (d.path === abs(r) || d.path.startsWith(abs(r) + '/'))) load(main)
    }).catch(failed),
    setMain: (r) => call('latex.set_main', { ...where, main: abs(r) })
      .then(() => { setMain(abs(r)); toast(`${basename(r)} builds the PDF now`) }).catch(failed),
    copyPath: (r) => copyText(abs(r)).then((ok) => toast(ok ? 'Path copied' : "Couldn't copy")),
  }

  const leave = async () => { if (await save()) onClose() }
  useBackLayer(() => { leave() })

  const { errors } = counts(last?.issues ?? [])
  const docRel = doc ? rel(folder, doc.path) : ''
  const lang = doc ? detect(doc.path).id : 'latex'
  const keys = useMemo(() => keyRow(lang), [lang])
  const typing = pane === 'source' && editing && !!doc

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 shrink-0 items-center gap-1 pr-2 pl-1">
        <button aria-label="Back to papers" onClick={leave}
          className="grid size-12 shrink-0 place-items-center rounded-full active:bg-hover"><ArrowLeft size={24} /></button>
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-xl font-bold">{paper.name}</h1>
          <p className="truncate text-sm text-dim">{paper.cluster_name} · {saving ? 'Saving…' : dirty ? 'Not saved'
            : 'Saved'}</p>
        </div>
        <button aria-label="Files" onClick={() => setOpen('files')}
          className="grid size-12 place-items-center rounded-full active:bg-hover"><FolderOpen size={22} /></button>
        <button aria-label="Paper options" onClick={() => setOpen('menu')}
          className="grid size-12 place-items-center rounded-full active:bg-hover"><MoreVertical size={22} /></button>
      </header>
      <div className="shrink-0 px-4 pb-2">
        <Segments value={pane} onChange={setPane} options={[['source', 'Source'], ['pdf', 'PDF'],
          ['log', running ? 'Log · building' : errors ? `Log · ${errors}` : 'Log']]} />
      </div>

      <div className="relative min-h-0 flex-1">
        <div className={`h-full flex-col ${pane === 'source' ? 'flex' : 'hidden'}`}>
          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
            <FileText size={18} className="ml-2 shrink-0 text-dim" />
            <span className="min-w-0 flex-1 truncate px-1 font-semibold">{docRel || basename(main)}</span>
            <button aria-label="Show this line in the PDF" onClick={toPdf}
              className="grid size-11 place-items-center rounded-full text-dim active:bg-hover"><LocateFixed size={20} /></button>
            {dirty && <button aria-label="Save" onClick={saveNow}
              className="grid size-11 place-items-center rounded-full text-accent-text active:bg-hover"><Save size={20} /></button>}
            <button aria-label={editing ? 'Done editing' : 'Edit'} onClick={() => editor.current?.setEditable(!editing)}
              className={`flex h-11 items-center gap-1.5 rounded-full px-3 font-semibold active:bg-hover ${
                editing ? 'text-accent-text' : ''}`}>
              {editing ? <><Check size={18} /> Done</> : <><Pencil size={18} /> Edit</>}</button>
          </div>
          <div className="min-h-0 flex-1">
            {docError ? <p className="p-6 text-center text-bad">{docError}</p>
              : !doc ? <div className="grid h-full place-items-center"><Spinner size={28} /></div>
              : <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={28} /></div>}>
                  <Editor docKey={`${doc.path}:${doc.version}`} path={doc.path} text={doc.text} line={doc.line}
                    handle={editor} className="h-full" onChange={() => setDirty(true)} onSave={saveNow}
                    onEditable={setEditing} />
                </Suspense>}
          </div>
        </div>
        {pane === 'pdf' && <PdfPane data={pdf.data} memory={`latex:${cluster}:${main}`} target={target} onSync={fromPdf}
          loading={!pdf.none && !pdf.error} progress={progress}
          message={pdf.none ? <Empty title="No PDF yet" text="Tap Build to make it on the cluster." />
            : pdf.error ? <Empty title="Couldn't read the PDF" text={pdf.error} /> : undefined} />}
        {pane === 'log' && <LogPane running={!!running} log={log} last={last} onGo={goIssue} onStop={stop} />}

        {pane !== 'log' && !typing && (
          <button onClick={build} disabled={!!running} aria-label="Build"
            className="absolute right-4 bottom-4 flex h-14 items-center gap-2 rounded-full bg-accent px-5 font-bold
              text-white shadow-[var(--shadow-dialog)] active:brightness-90 disabled:opacity-80">
            {running ? <Spinner size={20} /> : <RefreshCw size={20} />} {running ? 'Building' : 'Build'}</button>
        )}
      </div>

      {typing && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-t border-line bg-header px-2 py-1">
          {keys.map((k) => (
            <button key={k.id} aria-label={k.title} onPointerDown={(e) => e.preventDefault()}
              onClick={() => { const v = editor.current?.view(); if (v) k.run(v) }}
              className="h-11 min-w-11 shrink-0 rounded-lg bg-pill px-3 font-mono text-base active:bg-selected">
              {k.label}</button>
          ))}
        </div>
      )}

      {open === 'menu' && <ActionSheet title={paper.name} onClose={() => setOpen(null)} actions={[
        { label: 'Show this line in the PDF', icon: LocateFixed, onPick: toPdf },
        { label: 'Git', icon: GitBranch, onPick: () => setOpen('git') },
        { label: 'Build settings', icon: Settings2, onPick: () => setOpen('build') },
        { label: 'Close the paper', icon: X, onPick: leave },
      ]} />}
      {open === 'files' && <FilesSheet entries={tree} current={docRel} main={rel(folder, main)} actions={files}
        onClose={() => setOpen(null)} />}
      {open === 'git' && <GitSheet where={where} before={save} onClose={() => setOpen(null)}
        onPulled={() => { refresh(); if (doc) load(doc.path, editor.current?.line()) }} />}
      {open === 'build' && <BuildSheet cluster={cluster} clusterName={paper.cluster_name} settings={settings}
        onSaved={setSettings} onClose={() => setOpen(null)} auto={auto} onAuto={(on) => {
          setAuto(on)
          try { localStorage.setItem('latex.auto', on ? '1' : '0') } catch { /* private window */ }
        }} />}
    </div>
  )
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex max-w-xs flex-col items-center gap-2">
      <FileText size={40} strokeWidth={1.5} className="text-dim" />
      <div className="font-semibold">{title}</div>
      <p className="text-dim">{text}</p>
    </div>
  )
}
