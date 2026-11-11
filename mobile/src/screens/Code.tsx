// Code: a light editor for files on the cluster (docs/design/code.md). The start view picks a project; a file shows
// the desktop's tab row, path bar and status line. The file tree and the Ask panel slide over the file, its terminals
// come up from the bottom. Files open in view mode so scrolling never brings up the keyboard; Edit starts typing,
// with a row of keys above the keyboard. Open files stay open on other pages, and unsaved edits survive closing the app.
import { Copy, Folder, Hash } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'

import { getAsk, loadAsks, runningCount, unseenCount, useAsks } from '@shared/components/code/ask'
import { AskPanel } from '@shared/components/code/desktop/AskPanel'
import { useFolderSessions } from '@shared/components/code/desktop/folderSessions'
import { GoToFile } from '@shared/components/code/desktop/GoToFile'
import { closeFolderTerminals } from '@shared/components/code/desktop/panel'
import { folderName, inside } from '@shared/components/code/desktop/paths'
import { StatusLine, type Look } from '@shared/components/code/desktop/StatusLine'
import { TerminalToggle } from '@shared/components/code/desktop/TerminalToggle'
import { parentDir } from '@shared/components/code/desktop/text'
import { Tree } from '@shared/components/code/desktop/Tree'
import { usePlaces } from '@shared/components/code/desktop/usePlaces'
import { useTerminalPanel } from '@shared/components/code/desktop/useTerminalPanel'
import { openFolder, rememberFolder } from '@shared/components/code/desktop/workspace'
import { discardDraft, findDraft, keepDrafts, type Draft } from '@shared/components/code/drafts'
import type { EditorHandle, Selection } from '@shared/components/code/Editor'
import { detectIndent, type LangId } from '@shared/components/code/languages'
import { closeFile, getFile, isDirty, openFile, reloadFile, saveFile, setCursor, setEditing, setText, useCode,
  type OpenFile } from '@shared/components/code/store'
import { onWatch, startWatch, undoAgentChange, type WatchEvent } from '@shared/components/code/watch'
import { setActiveCluster, useActiveCluster } from '@shared/components/clusters/active'
import { NotConnected } from '@shared/components/clusters/NotConnected'
import { getTab } from '@shared/components/terminals/tabStore'
import { openNew } from '@shared/components/terminals/tabs'
import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo, usePageParams } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Limits } from '@shared/types/clusters'
import type { AskKind } from '@shared/types/code'
import { useBackLayer } from '../nav'
import { useAskForNode } from '../parts/AskForNode'
import { Header } from '../parts/Header'
import { Banners, type Banner } from '../parts/code/Banners'
import { ConflictChoice, ConflictSheet, type Compare } from '../parts/code/ConflictSheet'
import { FileBar } from '../parts/code/FileBar'
import { FileTabs } from '../parts/code/FileTabs'
import { KeyRow } from '../parts/code/KeyRow'
import { LogFollow } from '../parts/code/LogFollow'
import { SearchBar } from '../parts/code/SearchBar'
import { SelectionBar } from '../parts/code/SelectionBar'
import { Start } from '../parts/code/Start'
import { Switcher } from '../parts/code/Switcher'
import { TerminalPanel } from '../parts/code/TerminalPanel'
import { TreeTop } from '../parts/code/TreeTop'
import { folderOf, isLog, lastError, preloadLanguage, reference, runCommand, shortCluster } from '../parts/code/util'
import { useEditorKeyboard } from '../parts/keyboard'
import { FolderPicker } from '../parts/projects/FolderPicker'
import { BackLayer, Button, ConfirmDialog, Dialog, Field, MainButton, useToast, type MenuItem } from '../ui'

const Editor = lazy(() => import('@shared/components/code/Editor'))

const PREFS = 'hpc-hub-code-view'
type Prefs = { wrap: boolean; fontSize: number }
function prefs(): Prefs {
  try { return { wrap: true, fontSize: 13, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') } }
  catch { return { wrap: true, fontSize: 13 } }
}

const spinner = <div className="grid h-full place-items-center"><Spinner size={28} /></div>

type Confirm = { kind: 'close' | 'reload' | 'theirs'; file: OpenFile } | null

export function Code() {
  const toast = useToast()
  const go = useGo()
  const nodeFirst = useAskForNode()
  const params = usePageParams()
  const { files, current } = useCode()
  useAsks()  // redraw the Ask badge as asks change
  const { clusters, sessions, cluster: active } = useActiveCluster()
  const cluster = active?.id ?? ''
  const f = files.find((x) => x.key === current) ?? null
  const editor = useRef<EditorHandle | null>(null)
  const cursorAt = useRef<{ key: string; line: number } | null>(null)
  const seen = useRef(new Map<string, number>())  // the version of each file the editor shows
  const readonly = useRef(new Set<string>())      // opened from a link as read-only (a job's output)

  const [root, setRootState] = useState(() => openFolder(cluster))  // the open folder, '' for none
  const places = usePlaces(cluster)
  const { panel, setPanel } = useTerminalPanel(root)
  const [tree, setTree] = useState(false)
  const [goTo, setGoTo] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  const [ask, setAsk] = useState<{ kind: AskKind; id: string | null } | null>(null)
  const [searching, setSearching] = useState(false)
  const [compare, setCompare] = useState<Compare | null>(null)
  const [conflict, setConflict] = useState<OpenFile | null>(null)
  const [gotoLine, setGotoLine] = useState(false)
  const [lineText, setLineText] = useState('')
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [closing, setClosing] = useState<{ next: string; unsaved: OpenFile[] } | null>(null)
  const [view, setView] = useState<Prefs>(prefs)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [tick, setTick] = useState(0)
  const keyboard = useEditorKeyboard()  // the header and status line go away while typing, to give the editor its room
  const [lang, setLang] = useState<LangId>('plain')
  const [look, setLook] = useState<Look>({ lang: '', indent: '', line: 1, col: 1, selected: 0 })
  const [events, setEvents] = useState<Record<string, WatchEvent>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [follow, setFollow] = useState(true)
  const [partitions, setPartitions] = useState<Record<string, string[]>>({})

  useBackLayer(() => setTree(false), tree)
  useBackLayer(() => setAsk(null), !!ask)
  useBackLayer(() => setPanel(false), panel && !!root)

  const clusterName = (id: string) => shortCluster(clusters?.find((c) => c.id === id)?.name ?? id)
  const connected = (id: string) => !!sessions[id]?.connected
  const locked = (file: OpenFile) => !file.writable || readonly.current.has(file.key) || isLog(file.path)

  const setRoot = useCallback((path: string) => {
    rememberFolder(cluster, path)
    setRootState(path)
  }, [cluster])
  useEffect(() => { setRootState(openFolder(cluster)) }, [cluster])
  const project = root ? folderName(root, places.home, places.projects) : ''
  const live = active && connected(cluster) && root
    ? { id: cluster, name: active.name, node: sessions[cluster]?.node ?? '', job: sessions[cluster]?.job ?? '' } : null
  const terminals = useFolderSessions(live, root)

  // watching the open files, and keeping unsaved edits, while the page is open
  useEffect(() => {
    const stopWatch = startWatch()
    const stopDrafts = keepDrafts()
    const stopEvents = onWatch((e) => {
      if (e.kind === 'reloaded') {
        const file = getFile(e.key)
        if (file && !isLog(file.path)) toast(`${file.name} was updated from ${clusterName(file.cluster)}`)
        setEvents((all) => { const { [e.key]: _, ...rest } = all; return rest })
      } else setEvents((all) => ({ ...all, [e.key]: e }))
    })
    return () => { stopWatch(); stopDrafts(); stopEvents() }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  // go('code', { cluster, folder }) from a project, go('code', { cluster, path, line, readonly }) from Jobs, Files or
  // an error line; ask: '<id>' from a notification that an agent's answer is ready shows it. Every new link counts.
  useEffect(() => {
    if (!params.cluster) return
    setActiveCluster(params.cluster)
    if (params.folder) { rememberFolder(params.cluster, params.folder); setRootState(params.folder) }
    if (params.path) {
      if (params.readonly) readonly.current.add(`${params.cluster}:${params.path}`)
      void open(params.cluster, params.path, Number(params.line) || undefined)
    }
    const id = params.ask
    if (id) {
      if (getAsk(id)) setAsk({ kind: 'free', id })
      else loadAsks(params.cluster).catch(() => {}).finally(() => setAsk({ kind: 'free', id }))
    }
  }, [params])  // eslint-disable-line react-hooks/exhaustive-deps

  // a file that just opened: get its language ready for diffs, and look for edits from earlier
  useEffect(() => {
    if (!f || f.loading || f.error) return
    preloadLanguage(f.path)
    findDraft(f.cluster, f.path).then((d) => {
      if (d && d.text !== getFile(f.key)?.text) setDrafts((all) => ({ ...all, [f.key]: d }))
    }).catch(() => {})
    if (lang === 'slurm' && !partitions[f.cluster]) {
      call<Limits>('clusters.partitions', { cluster: f.cluster, partition: '', qos: '' })
        .then((l) => setPartitions((all) => ({ ...all, [f.cluster]: l.partitions }))).catch(() => {})
    }
  }, [f?.key, f?.loading, lang])  // eslint-disable-line react-hooks/exhaustive-deps

  // text that changed from outside the editor (a reload, an accepted change, a restored draft) goes into it
  useEffect(() => {
    if (!f || f.loading) return
    const h = editor.current
    const was = seen.current.get(f.key)
    seen.current.set(f.key, f.version)
    if (!h || was === undefined || was === f.version) return
    if (h.text() !== f.text) h.applyText(f.text, { undoable: isDirty(f) })
    else if (f.cursor.line > 1) h.goto(f.cursor.line)
  }, [f?.key, f?.version])  // eslint-disable-line react-hooks/exhaustive-deps

  // leaving a file keeps where you were in it
  useEffect(() => {
    setSelection(null)
    setSearching(false)
    setLook((l) => ({ ...l, line: 1, col: 1, selected: 0 }))
    return () => {
      const at = cursorAt.current
      if (at) setCursor(at.key, { line: at.line, col: 0 })
    }
  }, [f?.key])

  async function open(c: string, path: string, line?: number, editing = false) {
    setTree(false)
    seen.current.delete(`${c}:${path}`)
    await openFile(c, path, line)
    if (editing) setEditing(`${c}:${path}`, true)
  }
  const openPath = (path: string) => void open(cluster, path)

  async function save(file: OpenFile | null = f): Promise<boolean> {
    if (!file) return false
    const r = await saveFile(file.key)
    if (r.saved) {
      toast('Saved')
      void discardDraft(file.cluster, file.path)
      setEvents((all) => { const { [file.key]: _, ...rest } = all; return rest })
      return true
    }
    if (r.conflict) setConflict(getFile(file.key) ?? file)
    else toast(r.error)
    return false
  }

  function close(file: OpenFile) {
    if (isDirty(file)) setConfirm({ kind: 'close', file })
    else closeFile(file.key)
  }

  const reload = (file: OpenFile) => isDirty(file) ? setConfirm({ kind: 'reload', file }) : void reloadFile(file.key)

  // closing the project closes its files (asking first about unsaved ones) and its terminal tabs; then next opens
  const closeProject = (next = '') => {
    const was = root
    const mine = files.filter((x) => x.cluster === cluster && inside(x.path, was))
    const unsaved = mine.filter(isDirty)
    if (unsaved.length) return setClosing({ next, unsaved })
    finishClose(next, mine, [])
  }
  const finishClose = (next: string, mine: OpenFile[], unsaved: OpenFile[]) => {
    for (const x of mine) closeFile(x.key)
    for (const x of unsaved) void discardDraft(x.cluster, x.path)
    closeFolderTerminals(cluster, root)
    setRoot(next)
  }
  const openProject = (path: string) => { setTree(false); if (path !== root) closeProject(path) }
  const switcher = (
    <Switcher name={project || 'Open a project'} open={root} home={places.home} projects={places.projects}
      recent={places.recent} onOpen={openProject} onBrowse={() => setBrowsing(true)}
      onClose={root ? () => { setTree(false); closeProject() } : undefined} />
  )

  async function submit(file: OpenFile) {
    if (isDirty(file) && !(await save(file))) return
    try {
      const r = await call<{ job_id: string }>('jobs.submit', { cluster: file.cluster, path: file.path })
      toast(`Submitted job ${r.job_id}`, { action: { label: 'Open Jobs', run: () => go('jobs', { cluster: file.cluster }) } })
    } catch (e) {
      toast(`Couldn't submit: ${(e as Error).message}`, { kind: 'error' })
    }
  }

  async function runInTerminal(file: OpenFile, command: string) {
    if (isDirty(file) && !(await save(file))) return
    const node = sessions[file.cluster]?.node
    try {
      const key = await openNew(file.cluster, { name: `run ${file.name}`, node: !!node, folder: folderOf(file.path), color: '' })
      const tab = getTab(key)
      go('terminals')
      // the terminal needs a moment to start its tmux session before it takes text
      for (let i = 0; i < 6 && tab; i++) {
        await new Promise((r) => setTimeout(r, 800))
        try {
          await call('terminals.send', { cluster: file.cluster, session: tab.session, node: tab.node, text: command })
          return
        } catch { /* not ready yet */ }
      }
      toast(`Type ${command} in the terminal to run it`)
    } catch (e) {
      toast((e as Error).message)
    }
  }

  // -- what the banners say about the open file -----------------------------------------------------------------
  const banners: Banner[] = []
  if (f && !f.loading && !f.error) {
    const name = clusterName(f.cluster)
    const e = events[f.key]
    if (!connected(f.cluster)) {
      banners.push({ id: 'offline', tone: 'warn', text: `Not connected to ${name}. Connect to save.`,
        actions: [{ label: 'Connect', primary: true, run: () => void call('clusters.connect', { cluster: f.cluster, switch: true })
          .catch((err: Error) => toast(err.message)) }] })
    }
    if (e?.kind === 'changed') {
      banners.push({ id: 'changed', tone: 'warn', text: `${f.name} changed on ${name} while you were editing.`,
        actions: [
          { label: 'Compare', primary: true, run: () => setCompare({ kind: 'cluster', file: f }) },
          { label: `Use ${name}'s`, run: () => setConfirm({ kind: 'theirs', file: f }) },
          { label: 'Save mine', run: () => void saveFile(f.key, true).then((r) => {
            toast(r.saved ? 'Saved' : r.conflict ? 'It changed again. Try once more.' : r.error)
            if (r.saved) setEvents((all) => { const { [f.key]: _, ...rest } = all; return rest })
          }) },
        ] })
    }
    if (e?.kind === 'agent-changed') {
      banners.push({ id: 'agent', tone: 'info', text: `${e.agent} changed ${f.name}.`,
        actions: [
          { label: 'Keep', primary: true, run: () => setEvents((all) => { const { [f.key]: _, ...rest } = all; return rest }) },
          { label: 'Undo', run: () => void undoAgentChange(f.key, e.before).then((ok) => {
            toast(ok ? 'Put back as it was' : `${f.name} changed again, so it was left as is`)
            setEvents((all) => { const { [f.key]: _, ...rest } = all; return rest })
          }) },
        ] })
    }
    if (e?.kind === 'deleted') {
      banners.push({ id: 'deleted', tone: 'bad', text: `${f.name} is gone from ${name}. Save to put it back.`,
        actions: [{ label: 'Close', run: () => closeFile(f.key) }] })
    }
    const d = drafts[f.key]
    if (d) {
      const when = new Date(d.at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
      const drop = () => {
        void discardDraft(f.cluster, f.path)
        setDrafts((all) => { const { [f.key]: _, ...rest } = all; return rest })
      }
      banners.push(d.base_sha === f.sha
        ? { id: 'draft', text: `You have edits from ${when} that weren't saved.`, actions: [
            { label: 'Restore', primary: true, run: () => { setCompare({ kind: 'draft', file: f, draft: d.text }); drop() } },
            { label: 'Discard', run: drop }] }
        : { id: 'draft', tone: 'warn', text: `You have edits from ${when}, but the file changed on ${name} since.`, actions: [
            { label: 'Compare', primary: true, run: () => { setCompare({ kind: 'draft', file: f, draft: d.text }); drop() } },
            { label: 'Discard', run: drop }] })
    }
    if (isLog(f.path)) {
      if (lastError(f.text)) {
        banners.push({ id: 'error', tone: 'bad', text: 'This ends with an error.', actions: [
          { label: 'Fix this error', primary: true, run: () => setAsk({ kind: 'fix', id: null }) }] })
      }
    } else if (locked(f) && f.readonlyReason) {
      banners.push({ id: 'readonly', text: `Read only: ${f.readonlyReason}.` })
    }
  }

  function changeView(change: Partial<Prefs>) {
    const next = { ...view, ...change }
    setView(next)
    try { localStorage.setItem(PREFS, JSON.stringify(next)) } catch { /* private window */ }
  }

  const copy = (text: string, done: string) => void copyText(text).then((ok) => toast(ok ? done : "Couldn't copy"))
  const log = !!f && isLog(f.path)
  const editable = !!f && !f.loading && !f.error && !locked(f)
  const command = f && !f.loading ? runCommand(f.path, f.text) : ''

  // what tapping the path offers: the desktop has these on right clicks and menus
  const fileMenu: MenuItem[][] = !f ? [] : [
    [{ label: 'Copy path', icon: Copy, onClick: () => copy(f.path, 'Path copied') },
      ...(log ? [] : [{ label: 'Copy path with the line', icon: Hash,
        onClick: () => copy(`${f.path}:${editor.current?.line() ?? f.cursor.line}`, 'Copied with the line') }]),
      { label: 'Show in Files', icon: Folder, onClick: () => go('files', { cluster: f.cluster, path: folderOf(f.path) }) }],
    [...(log ? [] : [{ label: 'Go to line', onClick: () => { setLineText(''); setGotoLine(true) } }]),
      { label: view.wrap ? "Don't wrap long lines" : 'Wrap long lines', onClick: () => changeView({ wrap: !view.wrap }) },
      { label: 'Bigger text', onClick: () => changeView({ fontSize: Math.min(22, view.fontSize + 1) }) },
      { label: 'Smaller text', onClick: () => changeView({ fontSize: Math.max(10, view.fontSize - 1) }) },
      ...(command && !log ? [{ label: 'Run in a terminal',
        onClick: () => nodeFirst.guard(f.cluster, 'Your script', () => void runInTerminal(f, command)) }] : [])],
    [{ label: 'Close file', onClick: () => close(f) }],
  ]

  const goLine = () => {
    const n = parseInt(lineText, 10)
    setGotoLine(false)
    if (n > 0) editor.current?.goto(n)
  }

  const treeTop = (close?: () => void) => <TreeTop canGoTo={connected(cluster) && !!root} onGoTo={() => setGoTo(true)}
    onClose={close} />
  const treeBody = !active ? spinner
    : !connected(cluster) ? <NotConnected cluster={active} session={sessions[cluster]} what="files" />
    : root ? <div className="flex min-h-0 flex-1 flex-col [&_.h-7]:h-8">
        <Tree cluster={cluster} root={root} head={switcher} current={f?.cluster === cluster ? f.path : null}
          onOpen={openPath} onOther={(p) => go('files', { cluster, path: parentDir(p) })} /></div>
    : <div className="flex h-10 shrink-0 items-center px-2">{switcher}</div>

  return (
    <div className="flex h-full flex-col bg-window">
      {!keyboard && <Header title="Code" />}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {f ? (
          <>
            <FileTabs files={files} current={current} onClose={close} onTree={() => setTree(true)} />
            {!f.loading && <FileBar file={f} slurm={lang === 'slurm'} log={log} following={follow} asking={!!ask}
              badge={runningCount() || unseenCount()} canEdit={editable} menu={fileMenu} onReload={() => reload(f)}
              onFind={() => setSearching(true)} onAsk={() => setAsk(ask ? null : { kind: 'free', id: null })}
              onSave={() => void save()} onEdit={() => { setEditing(f.key, true); editor.current?.setEditable(true) }}
              onSubmit={() => void submit(f)} onFollow={() => setFollow((x) => !x)} />}
            {searching && <SearchBar editor={editor} canReplace={editable && f.editing} tick={tick}
              onClose={() => setSearching(false)} onReplaced={(n) => toast(n === 1 ? 'Replaced 1' : `Replaced ${n}`)} />}
            <Banners banners={banners} />
            <div className="relative flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 bg-view">
                {f.loading && spinner}
                {f.error && (
                  <div className="flex flex-col items-start gap-3 p-4">
                    <p className="text-bad">{f.error}</p>
                    <div className="flex gap-2">
                      <Button onClick={() => { const { cluster: c, path } = f; closeFile(f.key); void open(c, path) }}>Try again</Button>
                      <Button onClick={() => closeFile(f.key)}>Close</Button>
                    </div>
                  </div>
                )}
                {!f.loading && !f.error && log && (
                  <LogFollow file={f} follow={follow} fontSize={view.fontSize}
                    onSpot={(s) => void open(f.cluster, s.path, s.line)} />
                )}
                {!f.loading && !f.error && !log && (
                  <Suspense fallback={spinner}>
                    <Editor docKey={f.key} path={f.path} text={f.text} editable={f.editing && !locked(f)} readOnly={locked(f)}
                      wrap={view.wrap} fontSize={view.fontSize} line={f.cursor.line} handle={editor}
                      partitions={() => partitions[f.cluster] ?? []}
                      onChange={() => { const h = editor.current; if (h) setText(f.key, h.text()) }}
                      onSave={() => void save()} onFind={() => setSearching(true)}
                      onLanguage={(l) => {
                        setLang(l.id)
                        const ind = detectIndent(f.text, l.id)
                        setLook((x) => ({ ...x, lang: l.name, indent: ind.tabs ? 'Tabs' : `Spaces: ${ind.size}` }))
                      }}
                      onEditable={(on) => setEditing(f.key, on)}
                      onSelection={(s) => {
                        cursorAt.current = { key: f.key, line: s.fromLine }
                        setSelection(s.empty ? null : s)
                        setTick((t) => t + 1)
                        const v = editor.current?.view()
                        if (v) {
                          const head = v.state.selection.main.head
                          const line = v.state.doc.lineAt(head)
                          setLook((x) => ({ ...x, line: line.number, col: head - line.from + 1,
                            selected: s.empty ? 0 : s.text.length }))
                        }
                      }} />
                  </Suspense>
                )}
              </div>
              {root && panel && <TerminalPanel cluster={cluster} live={live} folder={root} name={project} home={places.home}
                sessions={terminals} onHide={() => setPanel(false)} />}
            </div>
            {selection && (
              <SelectionBar selection={selection} onCopy={() => copy(selection.text, 'Copied')}
                onAsk={() => setAsk({ kind: 'free', id: null })} onExplain={() => setAsk({ kind: 'explain', id: null })}
                onReference={() => copy(reference(f.path, selection.fromLine, selection.toLine), 'Copied where it is')} />
            )}
            {!keyboard && !f.loading && <StatusLine file={f} look={look} folder={root || undefined}
              left={root ? <TerminalToggle shown={panel} count={terminals.here.length} onToggle={() => setPanel(!panel)} />
                : undefined} />}
            {keyboard && f.editing && !log && <KeyRow lang={lang} editor={editor} />}
          </>
        ) : (
          <>
            {treeTop()}
            {!root || !connected(cluster) ? treeBody : <div className="flex min-h-0 flex-1 flex-col">{treeBody}</div>}
            {!root && active && connected(cluster) && (
              <Start home={places.home} projects={places.projects} recent={places.recent} onOpen={openProject}
                onBrowse={() => setBrowsing(true)} onFile={(c, p) => void open(c, p)} />
            )}
          </>
        )}

        {tree && (
          <>
            <button aria-label="Close" className="absolute inset-0 z-10" onClick={() => setTree(false)} />
            <aside aria-label="File tree" className="drawer-in absolute inset-y-0 left-0 z-20 flex w-[300px] max-w-[85%] flex-col
              bg-window shadow-[var(--shadow-menu)]">
              {treeTop(() => setTree(false))}
              {treeBody}
            </aside>
          </>
        )}
        {ask && (
          <>
            <button aria-label="Close" className="absolute inset-0 z-10" onClick={() => setAsk(null)} />
            <div className="drawer-in absolute inset-y-0 right-0 z-20 flex w-[330px] max-w-[92%] [&>aside]:w-full">
              <AskPanel kind={ask.kind} askId={ask.id} onAsk={(id) => setAsk({ kind: ask.kind, id })}
                onClose={() => setAsk(null)} logText={() => f?.text ?? ''}
                onOpenFile={(c, p) => void open(c, p)}
                context={f ? { cluster: f.cluster, path: f.path,
                  ...(selection ? { from_line: selection.fromLine, to_line: selection.toLine } : {}) } : null} />
            </div>
          </>
        )}
      </div>

      {goTo && cluster && <BackLayer onBack={() => setGoTo(false)}><GoToFile cluster={cluster} root={root || '~'}
        onOpen={openPath} onClose={() => setGoTo(false)} /></BackLayer>}
      {browsing && active && <FolderPicker cluster={{ id: cluster, name: active.name, connected: connected(cluster) }}
        start={root || '~'} projects={places.projects.map((p) => ({ label: p.name, path: p.path }))}
        onPick={openProject} onClose={() => setBrowsing(false)} />}
      {gotoLine && f && (
        <Dialog title="Go to line" width={320} onClose={() => setGotoLine(false)}
          actions={<MainButton onClick={goLine}>Go</MainButton>}>
          <div className="px-5">
            <Field label="Line" value={lineText} placeholder="42" inputMode="numeric" autoFocus
              onChange={(e) => setLineText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goLine()} />
          </div>
        </Dialog>
      )}
      {closing && (
        <ConfirmDialog title={`Close ${project} without saving?`} keep="Keep it open" confirm="Close without saving" danger
          text={`Your edits to ${closing.unsaved.map((x) => x.name).join(', ')} are lost.`} onClose={() => setClosing(null)}
          onConfirm={() => finishClose(closing.next, files.filter((x) => x.cluster === cluster && inside(x.path, root)),
            closing.unsaved)} />
      )}
      {confirm && (
        <ConfirmDialog title={confirm.kind === 'close' ? `Close ${confirm.file.name}?`
          : confirm.kind === 'theirs' ? `Use the copy on ${clusterName(confirm.file.cluster)}?` : `Reload ${confirm.file.name}?`}
          text={confirm.kind === 'close' ? "Your edits aren't saved. They'll be lost."
            : `Your edits are replaced by the version on ${clusterName(confirm.file.cluster)}.`}
          keep="Keep editing" danger onClose={() => setConfirm(null)}
          confirm={{ close: 'Close without saving', reload: 'Reload', theirs: `Use ${clusterName(confirm.file.cluster)}'s` }[confirm.kind]}
          onConfirm={() => {
            const file = confirm.file
            void discardDraft(file.cluster, file.path)
            setEvents((all) => { const { [file.key]: _, ...rest } = all; return rest })
            if (confirm.kind === 'close') closeFile(file.key)
            else void reloadFile(file.key)
          }} />
      )}
      {conflict && <ConflictChoice file={conflict} clusterName={clusterName(conflict.cluster)}
        onCompare={() => { setCompare({ kind: 'cluster', file: conflict }); setConflict(null) }}
        onDone={(msg) => {
          if (msg) toast(msg)
          setEvents((all) => { const { [conflict.key]: _, ...rest } = all; return rest })
          setConflict(null)
        }} />}
      {compare && <ConflictSheet compare={compare} clusterName={clusterName(compare.file.cluster)}
        onDone={(msg) => {
          if (msg) toast(msg)
          setEvents((all) => { const { [compare.file.key]: _, ...rest } = all; return rest })
          setCompare(null)
        }} />}
      {nodeFirst.sheet}
    </div>
  )
}
