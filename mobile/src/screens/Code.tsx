// Code: a light editor for files on the cluster, made to work with the agents (docs/design/code.md). Files open in
// view mode so scrolling never brings up the keyboard; Edit switches to typing with a row of keys above it. Ask
// sends the file or the selected lines to an agent on the cluster and shows its change as a diff to accept. Open
// files stay open while you look at other tabs (code/store.ts), and unsaved edits survive the app being closed.
import { Copy, Folder, FolderOpen, Hash, MoreVertical, Pencil, Save } from 'lucide-react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'

import { getAsk, isRunning, loadAsks, unseenCount, useAsks } from '@shared/components/code/ask'
import { discardDraft, findDraft, keepDrafts, type Draft } from '@shared/components/code/drafts'
import type { EditorHandle, Selection } from '@shared/components/code/Editor'
import type { LangId } from '@shared/components/code/languages'
import { closeFile, getFile, isDirty, openFile, reloadFile, saveFile, setCursor, setEditing, setText, useCode,
  type OpenFile } from '@shared/components/code/store'
import { onWatch, startWatch, undoAgentChange, type WatchEvent } from '@shared/components/code/watch'
import { useClusters } from '@shared/components/clusters/store'
import { getTab, openNew, openSession } from '@shared/components/terminals/tabs'
import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui'
import { useGo, usePageParams } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Limits } from '@shared/types/clusters'
import type { TmuxSession } from '@shared/types/terminals'
import { AskSheet, type AskStart } from '../parts/code/AskSheet'
import { Banners, type Banner } from '../parts/code/Banners'
import { ConflictChoice, ConflictSheet, type Compare } from '../parts/code/ConflictSheet'
import { FilesDrawer } from '../parts/code/FilesDrawer'
import { KeyRow } from '../parts/code/KeyRow'
import { LogFollow } from '../parts/code/LogFollow'
import { OpenTabs } from '../parts/code/OpenTabs'
import { ResultSheet } from '../parts/code/ResultSheet'
import { SearchBar } from '../parts/code/SearchBar'
import { SelectionBar } from '../parts/code/SelectionBar'
import { Start } from '../parts/code/Start'
import { blamed, folderOf, isLog, lastError, preloadLanguage, reference, rememberFile, runCommand, shortCluster,
  type Spot } from '../parts/code/util'
import { useEditorKeyboard } from '../parts/keyboard'
import { ActionSheet, BottomSheet, Button, ConfirmSheet, PromptSheet, Row, useToast, type SheetAction } from '../ui'

const Editor = lazy(() => import('@shared/components/code/Editor'))

const PREFS = 'hpc-hub-code-view'
type Prefs = { wrap: boolean; fontSize: number }
function prefs(): Prefs {
  try { return { wrap: true, fontSize: 13, ...JSON.parse(localStorage.getItem(PREFS) ?? '{}') } }
  catch { return { wrap: true, fontSize: 13 } }
}

const ICON = 'relative grid size-12 shrink-0 place-items-center rounded-full active:bg-pressed disabled:opacity-40'

type Confirm = { kind: 'close' | 'reload' | 'theirs'; file: OpenFile } | null

export function Code() {
  const toast = useToast()
  const go = useGo()
  const params = usePageParams()
  const { files, current } = useCode()
  const { asks } = useAsks()
  const { clusters, sessions } = useClusters()
  const f = files.find((x) => x.key === current) ?? null
  const editor = useRef<EditorHandle | null>(null)
  const cursorAt = useRef<{ key: string; line: number } | null>(null)
  const seen = useRef(new Map<string, number>())  // the version of each file the editor shows
  const readonly = useRef(new Set<string>())      // opened from a link as read-only (a job's output)

  const [drawer, setDrawer] = useState<{ cluster?: string; path?: string } | null>(null)
  const [searching, setSearching] = useState(false)
  const [ask, setAsk] = useState<AskStart | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [compare, setCompare] = useState<Compare | null>(null)
  const [conflict, setConflict] = useState<OpenFile | null>(null)
  const [menu, setMenu] = useState(false)
  const [pathSheet, setPathSheet] = useState(false)
  const [gotoLine, setGotoLine] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [view, setView] = useState<Prefs>(prefs)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [tick, setTick] = useState(0)
  const keyboard = useEditorKeyboard()  // App.tsx hides the bottom tabs on the same signal
  const [lang, setLang] = useState<LangId>('plain')
  const [events, setEvents] = useState<Record<string, WatchEvent>>({})
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [follow, setFollow] = useState(true)
  const [partitions, setPartitions] = useState<Record<string, string[]>>({})

  const clusterName = (id: string) => shortCluster(clusters?.find((c) => c.id === id)?.name ?? id)
  const connected = (id: string) => !!sessions[id]?.connected
  const locked = (file: OpenFile) => !file.writable || readonly.current.has(file.key) || isLog(file.path)

  // watching the open files, and keeping unsaved edits, while the tab is open
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

  // go('code', { cluster, path, line, readonly }) from Jobs, Files, Projects or an error line; ask: '<id>' from a
  // notification that an agent's answer is ready shows that answer right away. Every new link counts.
  useEffect(() => {
    if (!params.cluster) return
    if (params.path) {
      if (params.readonly) readonly.current.add(`${params.cluster}:${params.path}`)
      void open(params.cluster, params.path, Number(params.line) || undefined)
    }
    const id = params.ask
    if (id) {
      if (getAsk(id)) setResult(id)
      else loadAsks(params.cluster).catch(() => {}).finally(() => setResult(id))
    }
  }, [params])  // eslint-disable-line react-hooks/exhaustive-deps


  // a file that just opened: remember it, get its language ready for diffs, and look for edits from earlier
  useEffect(() => {
    if (!f || f.loading || f.error) return
    rememberFile(f.cluster, f.path)
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
    return () => {
      const at = cursorAt.current
      if (at) setCursor(at.key, { line: at.line, col: 0 })
    }
  }, [f?.key])

  async function open(cluster: string, path: string, line?: number, editing = false) {
    setDrawer(null)
    seen.current.delete(`${cluster}:${path}`)
    await openFile(cluster, path, line)
    if (editing) setEditing(`${cluster}:${path}`, true)
  }

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

  function startAsk(kind: AskStart['kind'], errorText?: string, spot?: Spot | null) {
    if (!f) return
    const sel = selection && !selection.empty ? selection : null
    const context = spot
      ? { cluster: f.cluster, path: spot.path, from_line: spot.line, to_line: spot.line }
      : sel ? { cluster: f.cluster, path: f.path, from_line: sel.fromLine, to_line: sel.toLine }
        : { cluster: f.cluster, path: f.path }
    setAsk({ context, kind, errorText, fileKey: spot ? `${f.cluster}:${spot.path}` : f.key })
  }

  async function submit(file: OpenFile) {
    if (isDirty(file) && !(await save(file))) return
    try {
      const r = await call<{ job_id: string }>('jobs.submit', { cluster: file.cluster, path: file.path })
      toast(`Job ${r.job_id} submitted. See it in Jobs.`)
    } catch (e) {
      toast((e as Error).message)
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
      const err = lastError(f.text)
      if (err) {
        banners.push({ id: 'error', tone: 'bad', text: 'This ends with an error.', actions: [
          { label: 'Fix this error', primary: true, run: () => startAsk('fix', err, blamed(err, folderOf(f.path))) }] })
      }
    } else if (locked(f) && f.readonlyReason) {
      banners.push({ id: 'readonly', text: `Read only: ${f.readonlyReason}.` })
    }
  }

  const running = asks.filter(isRunning).length
  const unseen = unseenCount()
  const editable = f && !f.loading && !f.error && !locked(f)
  const menuActions: SheetAction[] = []
  if (f && !f.loading) {
    const command = runCommand(f.path, f.text)
    if (!isLog(f.path)) {
      menuActions.push({ label: 'Find in file', onPick: () => setSearching(true) },
        { label: 'Go to line', onPick: () => setGotoLine(true) })
    }
    if (isLog(f.path)) menuActions.push({ label: follow ? 'Stop following' : 'Follow as it grows', onPick: () => setFollow((x) => !x) })
    menuActions.push(
      { label: view.wrap ? "Don't wrap long lines" : 'Wrap long lines', onPick: () => changeView({ wrap: !view.wrap }) },
      { label: 'Bigger text', onPick: () => changeView({ fontSize: Math.min(22, view.fontSize + 1) }) },
      { label: 'Smaller text', onPick: () => changeView({ fontSize: Math.max(10, view.fontSize - 1) }) })
    if (lang === 'slurm') menuActions.push({ label: 'Submit this job', onPick: () => void submit(f) })
    if (command && !isLog(f.path)) menuActions.push({ label: 'Run in a terminal', onPick: () => void runInTerminal(f, command) })
    menuActions.push(
      { label: `Reload from ${clusterName(f.cluster)}`, onPick: () => isDirty(f) ? setConfirm({ kind: 'reload', file: f })
        : void reloadFile(f.key) },
      { label: 'Show in Files', onPick: () => go('files', { cluster: f.cluster, path: folderOf(f.path) }) },
      { label: 'Close file', onPick: () => close(f) })
  }

  function changeView(change: Partial<Prefs>) {
    const next = { ...view, ...change }
    setView(next)
    try { localStorage.setItem(PREFS, JSON.stringify(next)) } catch { /* private window */ }
  }

  const copy = (text: string, done: string) => void copyText(text).then((ok) => toast(ok ? done : "Couldn't copy"))

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-1 px-1">
        <button aria-label="Open a file" className={ICON} onClick={() => setDrawer({ cluster: f?.cluster, path: f ? folderOf(f.path) : undefined })}>
          <FolderOpen size={22} /></button>
        {f
          ? <button onClick={() => setPathSheet(true)} className="flex min-h-12 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 text-left active:bg-pressed"
              aria-label={`${f.name}, ${f.path}`}>
              <span className="min-w-0 text-[17px] leading-tight font-semibold break-all">{f.name}</span>
              {isDirty(f) && <span className="size-2 shrink-0 rounded-full bg-text" aria-label="Unsaved" />}
            </button>
          : <h1 className="min-w-0 flex-1 px-1 text-2xl font-bold">Code</h1>}
        {f && !f.loading && (
          <Button aria-label={running ? `Ask an agent, ${running} running` : unseen ? 'Ask an agent, new answer' : 'Ask an agent'}
            className="mx-1 px-3.5" onClick={() => startAsk('free')}>
            Ask{running > 0 && <span className="font-normal text-dim tabular-nums">{running}</span>}
            {!running && unseen > 0 && <span aria-hidden className="size-2 rounded-full bg-text" />}
          </Button>
        )}
        {f && isDirty(f) && <button aria-label="Save" className={ICON} onClick={() => void save()}><Save size={20} /></button>}
        {f && <button aria-label="More" className={ICON} onClick={() => setMenu(true)}><MoreVertical size={20} /></button>}
      </header>

      <OpenTabs files={files} current={current} onClose={close} />
      {searching && f && <SearchBar editor={editor} canReplace={!!editable && f.editing} tick={tick}
        onClose={() => setSearching(false)} onReplaced={(n) => toast(n === 1 ? 'Replaced 1' : `Replaced ${n}`)} />}
      <Banners banners={banners} />

      <div className="relative min-h-0 flex-1">
        {!f && <Start onOpen={(c, p) => void open(c, p)} onBrowse={(cluster, path) => setDrawer({ cluster, path })} />}
        {f?.loading && <div className="grid h-full place-items-center"><Spinner size={28} /></div>}
        {f?.error && (
          <div className="flex flex-col items-start gap-3 p-4">
            <p className="text-bad">{f.error}</p>
            <div className="flex gap-2">
              <Button onClick={() => { const { cluster, path } = f; closeFile(f.key); void open(cluster, path) }}>Try again</Button>
              <Button onClick={() => closeFile(f.key)}>Close</Button>
            </div>
          </div>
        )}
        {f && !f.loading && !f.error && isLog(f.path) && (
          <LogFollow file={f} follow={follow} fontSize={view.fontSize}
            onSpot={(s) => void open(f.cluster, s.path, s.line)} />
        )}
        {f && !f.loading && !f.error && !isLog(f.path) && (
          <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={28} /></div>}>
            <Editor docKey={f.key} path={f.path} text={f.text} editable={f.editing && !locked(f)} readOnly={locked(f)}
              wrap={view.wrap} fontSize={view.fontSize} line={f.cursor.line} handle={editor}
              partitions={() => partitions[f.cluster] ?? []}
              onChange={() => { const h = editor.current; if (h) setText(f.key, h.text()) }}
              onSave={() => void save()} onFind={() => setSearching(true)} onLanguage={(l) => setLang(l.id)}
              onEditable={(on) => setEditing(f.key, on)}
              onSelection={(s) => {
                cursorAt.current = { key: f.key, line: s.fromLine }
                setSelection(s.empty ? null : s)
                setTick((t) => t + 1)
              }} />
          </Suspense>
        )}
        {f && editable && !f.editing && (
          <Button kind="primary" icon={Pencil} className="absolute right-4 bottom-4 shadow-[var(--shadow-menu)]"
            onClick={() => { setEditing(f.key, true); editor.current?.setEditable(true) }}>Edit</Button>
        )}
      </div>

      {f && selection && (
        <SelectionBar selection={selection} onCopy={() => copy(selection.text, 'Copied')}
          onAsk={() => startAsk('free')} onExplain={() => startAsk('explain')}
          onReference={() => copy(reference(f.path, selection.fromLine, selection.toLine), 'Copied where it is')} />
      )}
      {f && keyboard && f.editing && !isLog(f.path) && <KeyRow lang={lang} editor={editor} />}

      {drawer && <FilesDrawer start={drawer.cluster && drawer.path ? { cluster: drawer.cluster, path: drawer.path } : undefined}
        onOpen={(c, p, editing) => void open(c, p, undefined, editing)} onClose={() => setDrawer(null)} />}
      {menu && f && <ActionSheet title={f.name} actions={menuActions} onClose={() => setMenu(false)} />}
      {pathSheet && f && (
        <BottomSheet onClose={() => setPathSheet(false)}>
          <p className="pb-3 font-mono text-sm break-all select-text">{f.path}</p>
          <div className="-mx-4 border-t border-line">
            <Row icon={Copy} label="Copy path" onPress={() => { setPathSheet(false); copy(f.path, 'Path copied') }} />
            {!isLog(f.path) && (
              <Row icon={Hash} label="Copy path with the line" onPress={() => {
                setPathSheet(false); copy(`${f.path}:${editor.current?.line() ?? f.cursor.line}`, 'Copied with the line') }} />
            )}
            <Row icon={Folder} label="Show in Files" onPress={() => {
              setPathSheet(false); go('files', { cluster: f.cluster, path: folderOf(f.path) }) }} />
          </div>
        </BottomSheet>
      )}
      {gotoLine && f && (
        <PromptSheet title="Go to line" label="Line" placeholder="42" confirm="Go" onClose={() => setGotoLine(false)}
          onSubmit={(t) => { const n = parseInt(t, 10); if (n > 0) editor.current?.goto(n) }} />
      )}
      {confirm && (
        <ConfirmSheet title={confirm.kind === 'close' ? `Close ${confirm.file.name}?`
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
      {ask && (
        <AskSheet {...ask} onClose={() => setAsk(null)}
          onStarted={(id) => { setAsk(null); setResult(id) }}
          onOpenAsk={(id) => { setAsk(null); setResult(id) }}
          onSent={(cluster: string, s: TmuxSession, label: string) => {
            setAsk(null)
            toast(`Sent to ${label}`)
            openSession(cluster, s)
            go('terminals')
          }} />
      )}
      {result && <ResultSheet askId={result} onClose={() => setResult(null)} onOpenFile={(c, p) => void open(c, p)} />}
    </div>
  )
}

