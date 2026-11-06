import { Clock, FileCode2, FolderSearch, Play, RefreshCw, Save, Search, Sparkles, Send, SquareTerminal }
  from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { isMac } from '../components/app/platform'
import { setActiveCluster, useActiveCluster } from '../components/clusters/active'
import { ClusterPicker } from '../components/clusters/ClusterPicker'
import { shortName } from '../components/clusters/loginCopy'
import { NotConnected } from '../components/clusters/NotConnected'
import { runningCount, unseenCount, useAsks } from '../components/code/ask'
import { AskPanel } from '../components/code/desktop/AskPanel'
import { BannerRow, type Banner } from '../components/code/desktop/Banner'
import { CompareDialog } from '../components/code/desktop/Compare'
import { FindBar } from '../components/code/desktop/FindBar'
import { GoToFile } from '../components/code/desktop/GoToFile'
import { StatusLine, type Look } from '../components/code/desktop/StatusLine'
import { Tabs } from '../components/code/desktop/Tabs'
import { Start } from '../components/code/desktop/Start'
import { Switcher } from '../components/code/desktop/Switcher'
import { useFolderSessions } from '../components/code/desktop/folderSessions'
import { closeFolderTerminals, isToggle, TOGGLE_KEY } from '../components/code/desktop/panel'
import { TerminalPanel } from '../components/code/desktop/TerminalPanel'
import { time } from '../components/code/desktop/time'
import { Tree } from '../components/code/desktop/Tree'
import { folderName, inside } from '../components/code/desktop/paths'
import { usePlaces } from '../components/code/desktop/usePlaces'
import { openFolder, rememberFolder } from '../components/code/desktop/workspace'
import { discardDraft, findDraft, keepDrafts } from '../components/code/drafts'
import type { EditorHandle } from '../components/code/Editor'
import { detectIndent, type Lang } from '../components/code/languages'
import { closeFile, getFile, isDirty, openFile, reloadFile, replaceText, saveFile, selectFile, setCursor, setText,
  useCode, type OpenFile } from '../components/code/store'
import { onWatch, startWatch, undoAgentChange } from '../components/code/watch'
import { FolderPicker } from '../components/projects/FolderPicker'
import { useToast } from '../components/toast'
import { AlertDialog, Button, Dialog, EmptyState, IconButton, Spinner } from '../components/ui'
import { useGo, usePageParams } from '../nav'
import { call } from '../rpc'
import type { AskKind, OpenedFile } from '../types/code'

const Editor = lazy(() => import('../components/code/Editor'))

const LOG = /\.(out|err|log)$/i
const FOLLOW_EVERY = 3000
let panelShown = false  // the terminal panel, kept while you visit other pages
const HEIGHT = 'code.terminal.height'
const readOnlyKeys = new Set<string>()      // opened to look, not to edit (a job's output)

const mod = isMac ? '⌘' : 'Ctrl+'

/** A light editor for files on the clusters: tree, tabs, editor, terminals and the Ask panel. */
export function Code() {
  const toast = useToast()
  const go = useGo()
  const params = usePageParams()
  const { clusters, sessions, cluster: active } = useActiveCluster()
  const { files, current } = useCode()
  const { asks } = useAsks()
  const cluster = active?.id ?? ''
  const [root, setRootState] = useState(() => openFolder(cluster))  // the open folder, '' for none
  const places = usePlaces(cluster)
  const [panel, setPanelState] = useState(panelShown)
  const [height, setHeight] = useState(() => {
    try { return Number(localStorage.getItem(HEIGHT)) || 260 } catch { return 260 }
  })
  const handle = useRef<EditorHandle | null>(null)
  const [find, setFind] = useState<string | null>(null)       // the bar is open, with this to start
  const [goTo, setGoTo] = useState(false)
  const [ask, setAsk] = useState<{ kind: AskKind; id: string | null } | null>(null)
  const [selection, setSelection] = useState<{ from: number; to: number; count: number }>({ from: 0, to: 0, count: 0 })
  const [look, setLook] = useState<Look>({ lang: '', indent: '', line: 1, col: 1, selected: 0 })
  const [lang, setLang] = useState<Lang | null>(null)
  const [banners, setBanners] = useState<Record<string, Banner>>({})
  const [follow, setFollow] = useState<Set<string>>(new Set())
  const [dialog, setDialog] = useState<ReactNode>(null)
  const close = useCallback(() => setDialog(null), [])

  const file = files.find((f) => f.key === current) ?? null
  const name = (id: string) => shortName(clusters?.find((c) => c.id === id) ?? { name: id })
  const connected = !!sessions[cluster]?.connected

  const setRoot = useCallback((path: string) => {
    rememberFolder(cluster, path)
    setRootState(path)
  }, [cluster])
  useEffect(() => { setRootState(openFolder(cluster)) }, [cluster])
  const project = root ? folderName(root, places.home, places.projects) : ''

  const live = active && connected && root
    ? { id: cluster, name: active.name, node: sessions[cluster]?.node ?? '', job: sessions[cluster]?.job ?? '' } : null
  const terminals = useFolderSessions(live, root)
  const setPanel = (on: boolean) => { panelShown = on; setPanelState(on) }

  // opened from elsewhere: a file (Files' Edit, a job's output), or a folder (a project)
  useEffect(() => {
    if (params.cluster) setActiveCluster(params.cluster)
    if (params.cluster && params.folder) { rememberFolder(params.cluster, params.folder); setRootState(params.folder) }
    if (params.cluster && params.path) {
      const key = `${params.cluster}:${params.path}`
      if (params.readonly) readOnlyKeys.add(key)
      if (params.follow) setFollow((s) => new Set(s).add(key))
      void openFile(params.cluster, params.path, params.line ? Number(params.line) : undefined)
    }
  }, [params])

  useEffect(() => {  // drafts and the watcher run while the page is open
    const stopDrafts = keepDrafts()
    const stopWatch = startWatch()
    const stopEvents = onWatch((e) => {
      if (e.kind === 'reloaded') {
        setBanners((b) => { const { [e.key]: _, ...rest } = b; return rest })
        return
      }
      const banner: Banner = e.kind === 'changed' ? { kind: 'changed' } : e.kind === 'deleted' ? { kind: 'deleted' }
        : { kind: 'agent', agent: e.agent, before: e.before }
      setBanners((b) => ({ ...b, [e.key]: banner }))
    })
    return () => { stopDrafts(); stopWatch(); stopEvents() }
  }, [])

  // a file just finished opening: a draft from an earlier session?
  const loadedKeys = files.filter((f) => !f.loading && !f.error).map((f) => f.key).join('\n')
  const checked = useRef(new Set<string>())
  useEffect(() => {
    for (const f of files) {
      if (f.loading || f.error || checked.current.has(f.key)) continue
      checked.current.add(f.key)
      findDraft(f.cluster, f.path).then((d) => {
        const now = getFile(f.key)
        if (!d || !now || d.text === now.text) return
        setBanners((b) => ({ ...b, [f.key]: { kind: 'draft', draft: d, stale: d.base_sha !== now.sha } }))
      }).catch(() => {})
    }
  }, [loadedKeys])  // eslint-disable-line react-hooks/exhaustive-deps

  // text that changed from outside the editor (a reload, an accepted change, a restored draft) goes into it
  useEffect(() => {
    const h = handle.current
    if (!file || !h) return
    if (h.text() !== file.text) h.applyText(file.text, { undoable: isDirty(file) })
    if (follow.has(file.key)) h.goto(file.text.split('\n').length)
  }, [file?.key, file?.version])  // eslint-disable-line react-hooks/exhaustive-deps

  // logs you follow reload every few seconds and stay at the end
  useEffect(() => {
    if (!file || !follow.has(file.key)) return
    const key = file.key
    const t = window.setInterval(() => {
      const f = getFile(key)
      if (f && !isDirty(f)) void reloadFile(key)
    }, FOLLOW_EVERY)
    return () => clearInterval(t)
  }, [file?.key, follow])  // eslint-disable-line react-hooks/exhaustive-deps

  const dropBanner = (key: string) => setBanners((b) => { const { [key]: _, ...rest } = b; return rest })

  async function save(force = false): Promise<boolean> {
    const f = current ? getFile(current) : null
    if (!f || (!isDirty(f) && !force)) return true
    const r = await saveFile(f.key, force)
    if (r.saved) { dropBanner(f.key); return true }
    if (r.conflict) conflict(f)
    else toast(`Couldn't save ${f.name}: ${r.error}`, { kind: 'error' })
    return false
  }

  const compare = async (f: OpenFile, after: 'merge' | 'keep') => {
    try {
      const theirs = await call<OpenedFile>('code.open', { cluster: f.cluster, path: f.path })
      const mine = f.text
      setDialog(<CompareDialog title={`${f.name}: the cluster's version and yours`} path={f.path} base={theirs.text}
        mine={mine} note="Changes in green are yours. Reject the ones you don't want, then use the result."
        useLabel={after === 'merge' ? 'Use this' : 'Use this and save'} onClose={close}
        onUse={async (text) => {
          await reloadFile(f.key)         // the cluster's version becomes the base…
          replaceText(f.key, text)        // …and your picked changes go on top
          dropBanner(f.key)
          if (after === 'keep') await save()
        }} />)
    } catch (e) {
      toast(`Couldn't read ${f.name}: ${(e as Error).message}`, { kind: 'error' })
    }
  }

  // Taking the cluster's version throws your edits away, so it asks first
  const takeTheirs = (f: OpenFile) => setDialog(
    <AlertDialog title={`Throw away your edits to ${f.name}?`} keep="Keep editing" act={`Use ${name(f.cluster)}'s`}
      onClose={close} onAct={() => { close(); void reloadFile(f.key); dropBanner(f.key) }}>
      The file goes back to the version on {name(f.cluster)}.</AlertDialog>)

  function conflict(f: OpenFile) {
    setDialog(
      <Dialog title={`${f.name} changed on ${name(f.cluster)}`} onClose={close} width={460} actions={<>
        <Button onClick={() => { close(); void compare(f, 'keep') }}>Compare</Button>
        <Button onClick={() => takeTheirs(f)}>Use {name(f.cluster)}'s</Button>
        <Button onClick={() => { close(); void save(true) }}>Save mine</Button>
      </>}>
        <p className="text-dim">It changed while you were editing. Save mine writes over the cluster's version.</p>
      </Dialog>)
  }

  const closeTab = (key: string) => {
    const f = getFile(key)
    if (!f) return
    if (!isDirty(f)) { closeFile(key); dropBanner(key); return }
    setDialog(<AlertDialog title={`Close ${f.name} without saving?`} keep="Keep it open" act="Close without saving"
      onClose={close} onAct={() => { close(); closeFile(key); dropBanner(key); void discardDraft(f.cluster, f.path) }}>
      Your edits are lost.</AlertDialog>)
  }

  // Closing the project closes its files (asking first about unsaved ones) and its terminal tabs; then next opens
  const closeProject = (next = '') => {
    const was = root
    const mine = files.filter((f) => f.cluster === cluster && inside(f.path, was))
    const unsaved = mine.filter(isDirty)
    const finish = () => {
      for (const f of mine) { closeFile(f.key); dropBanner(f.key) }
      for (const f of unsaved) void discardDraft(f.cluster, f.path)
      closeFolderTerminals(cluster, was)
      setRoot(next)
    }
    if (!unsaved.length) return finish()
    const names = unsaved.map((f) => f.name)
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
    setDialog(<AlertDialog title={`Close ${project} without saving?`} keep="Keep it open" act="Close without saving"
      onClose={close} onAct={() => { close(); finish() }}>Your edits to {list} are lost.</AlertDialog>)
  }
  const openProject = (path: string) => { if (path !== root) closeProject(path) }
  const browse = () => active && setDialog(
    <FolderPicker cluster={{ id: cluster, name: active.name, connected }} start={root || '~'} onClose={close}
      projects={places.projects.map((p) => ({ label: p.name, path: p.path }))} onPick={openProject} />)
  const switcher = (
    <Switcher name={project || 'Open a project'} open={root} home={places.home} projects={places.projects}
      recent={places.recent} onOpen={openProject} onBrowse={browse} onClose={root ? () => closeProject() : undefined} />
  )

  const submit = async () => {
    if (!file) return
    if (isDirty(file) && !(await save())) return
    try {
      const r = await call<{ job_id: string }>('jobs.submit', { cluster: file.cluster, path: file.path })
      toast(`Submitted job ${r.job_id}`, { action: { label: 'Open Jobs', run: () => go('jobs', { cluster: file.cluster }) } })
    } catch (e) {
      toast(`Couldn't submit: ${(e as Error).message}`, { kind: 'error' })
    }
  }

  const openPath = (path: string) => void openFile(cluster, path)
  const openFind = () => setFind(handle.current?.selection().text.split('\n')[0] ?? '')

  useEffect(() => {  // Ctrl+` shows or hides the terminal, even from inside one
    const key = (e: KeyboardEvent) => {
      if (!isToggle(e) || !root) return
      e.preventDefault()
      e.stopPropagation()
      setPanel(!panelShown)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [root])

  useEffect(() => {  // keys that work anywhere on the page (the editor handles them itself when it has focus)
    const key = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(isMac ? e.metaKey : e.ctrlKey) || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === 'p') { e.preventDefault(); if (cluster) setGoTo(true) }
      if (k === 's' && file) { e.preventDefault(); void save() }
      if (k === 'f' && file) { e.preventDefault(); openFind() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  const onSelection = () => {
    const h = handle.current
    const v = h?.view()
    if (!h || !v || !file) return
    const sel = h.selection()
    const head = v.state.selection.main.head
    const line = v.state.doc.lineAt(head)
    setCursor(file.key, { line: line.number, col: head - line.from })
    setSelection({ from: sel.fromLine, to: sel.toLine, count: sel.empty ? 0 : sel.text.length })
    setLook((l) => ({ ...l, line: line.number, col: head - line.from + 1, selected: sel.empty ? 0 : sel.text.length }))
  }
  const onLanguage = (l: Lang) => {
    setLang(l)
    const f = file
    const ind = f ? detectIndent(f.text, l.id) : { tabs: false, size: 4 }
    setLook((x) => ({ ...x, lang: l.name, indent: ind.tabs ? 'Tabs' : `Spaces: ${ind.size}` }))
  }

  const banner = file ? banners[file.key] : undefined
  const isLog = !!file && LOG.test(file.path)
  const running = runningCount()
  const unseen = unseenCount()
  void asks  // redraw the badge as asks change

  return (
    <div className="flex h-full min-h-0 bg-window">
      <aside aria-label="File tree" className="flex w-[260px] shrink-0 flex-col border-r border-line bg-window">
        <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
          <ClusterPicker />
          <span className="flex-1" />
          <IconButton icon={FolderSearch} label={`Go to file (${mod}P)`} small disabled={!connected || !root}
            onClick={() => setGoTo(true)} />
        </div>
        {!active ? <div className="grid flex-1 place-items-center"><Spinner size={20} /></div>
          : !connected ? <div className="min-h-0 flex-1 overflow-auto"><NotConnected cluster={active}
              session={sessions[cluster]} what="files" /></div>
          : root ? <Tree cluster={cluster} root={root} head={switcher}
              current={file?.cluster === cluster ? file.path : null} onOpen={openPath}
              onOther={(p) => go('files', { cluster, path: p.replace(/\/[^/]*$/, '') || '/' })} />
          : <div className="flex h-10 shrink-0 items-center px-2">{switcher}</div>}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        {files.length > 0 && <Tabs files={files} current={current} clusterName={name} onPick={selectFile}
          onClose={closeTab} />}
        {file && (
          <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line px-2">
            <span className="min-w-0 flex-1 truncate px-1 font-mono text-xs text-dim" title={file.path}>{file.path}</span>
            {selection.count > 0 && (
              <Button size="sm" kind="ghost" onClick={() => setAsk({ kind: 'explain', id: null })}>
                <Sparkles size={14} /> Explain lines {selection.from}{selection.to > selection.from ? ` to ${selection.to}` : ''}
              </Button>
            )}
            {lang?.id === 'slurm' && file.writable && (
              <Button size="sm" kind="ghost" onClick={submit}><Send size={14} /> Submit job</Button>
            )}
            {isLog && (
              <Button size="sm" kind={follow.has(file.key) ? 'secondary' : 'ghost'}
                onClick={() => setFollow((s) => { const n = new Set(s); if (n.has(file.key)) n.delete(file.key); else n.add(file.key); return n })}>
                {follow.has(file.key) ? <Clock size={14} /> : <Play size={14} />}
                {follow.has(file.key) ? 'Following' : 'Follow'}</Button>
            )}
            <IconButton icon={RefreshCw} label="Reload from the cluster" small
              onClick={() => (isDirty(file) ? void compare(file, 'merge') : void reloadFile(file.key))} />
            <IconButton icon={Search} label={`Find (${mod}F)`} small onClick={openFind} />
            <button type="button" onClick={() => setAsk(ask ? null : { kind: 'free', id: null })}
              aria-pressed={!!ask} title="Ask an agent about this file"
              className={`relative flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-semibold transition-colors
                duration-90 ${ask ? 'bg-selected' : 'hover:bg-hover'}`}>
              Ask
              {(running > 0 || unseen > 0) && (
                <span className="grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[11px] text-white">
                  {running || unseen}</span>
              )}
            </button>
            <Button size="sm" kind={isDirty(file) ? 'primary' : 'ghost'} disabled={!isDirty(file) || !file.writable}
              onClick={() => void save()} title={`Save (${mod}S)`}><Save size={14} /> Save</Button>
          </div>
        )}
        {file && banner && <BannerRow file={file} banner={banner} clusterName={name(file.cluster)}
          onDismiss={() => dropBanner(file.key)} onReload={() => takeTheirs(file)}
          onCompare={() => void compare(file, 'merge')}
          onUndo={async (before) => {
            const ok = await undoAgentChange(file.key, before)
            if (!ok) toast(`${file.name} changed again, so nothing was undone`)
            dropBanner(file.key)
          }}
          onSaveAgain={() => { dropBanner(file.key); void save(true) }}
          onRestore={(d) => { replaceText(file.key, d.text); dropBanner(file.key) }}
          onCompareDraft={(d) => setDialog(<CompareDialog title={`${file.name}: your edits from ${time(d.at)}`}
            path={file.path} base={file.text} mine={d.text} useLabel="Put in editor" onClose={close}
            note="These edits were made on an older version. Pick the ones to keep."
            onUse={(text) => { replaceText(file.key, text); dropBanner(file.key) }} />)}
          onDiscardDraft={(d) => { void discardDraft(d.cluster, d.path); dropBanner(file.key) }} />}
        {file && !file.writable && !file.loading && !file.error && (
          <p className="shrink-0 border-b border-line bg-window px-4 py-1.5 text-sm text-dim">
            Read-only: {file.readonlyReason || 'this file can\'t be changed here'}.</p>
        )}
        {file && find !== null && <FindBar view={() => handle.current?.view() ?? null} editable={file.writable}
          start={find} onClose={() => { setFind(null); handle.current?.focus() }} />}

        <div className="code-main min-h-0 flex-1">
          {!file && !root ? (
            <Start home={places.home} projects={places.projects} recent={places.recent} onOpen={openProject}
              onBrowse={browse} />
          ) : !file ? (
            <EmptyState icon={FileCode2} title="No file open"
              text={`Pick a file on the left, or press ${mod}P to go to one.`}
              action={connected ? <Button onClick={() => setGoTo(true)}>Go to file</Button> : undefined} />
          ) : file.loading ? (
            <div className="grid h-full place-items-center"><Spinner size={24} /></div>
          ) : file.error ? (
            <EmptyState icon={FileCode2} title={`Couldn't open ${file.name}`} text={file.error}
              action={<Button onClick={() => { closeFile(file.key); void openFile(file.cluster, file.path) }}>Try again</Button>} />
          ) : (
            <Suspense fallback={<div className="grid h-full place-items-center"><Spinner size={24} /></div>}>
              <Editor key={file.key} docKey={file.key} path={file.path} text={file.text} handle={handle}
                editable={file.writable && !readOnlyKeys.has(file.key)} readOnly={!file.writable}
                line={follow.has(file.key) ? file.text.split('\n').length : file.cursor.line}
                onChange={() => { const h = handle.current; if (h) setText(file.key, h.text()) }}
                onSave={() => void save()} onFind={openFind} onSelection={onSelection} onLanguage={onLanguage} />
            </Suspense>
          )}
        </div>
        {root && panel && <TerminalPanel cluster={cluster} live={live} folder={root} name={project} home={places.home}
          sessions={terminals} height={height} onHide={() => setPanel(false)}
          onHeight={(h, done) => {
            setHeight(h)
            if (done) try { localStorage.setItem(HEIGHT, String(h)) } catch { /* private window */ }
          }} />}
        {(root || (file && !file.loading)) && <StatusLine file={file} look={look} folder={root || undefined}
          left={root ? (
          <button type="button" onClick={() => setPanel(!panel)} aria-pressed={panel}
            title={`${panel ? 'Hide' : 'Show'} the terminal (${TOGGLE_KEY})`}
            className={`-ml-1.5 flex h-7 shrink-0 items-center gap-1.5 px-1.5 hover:bg-hover hover:text-text
              ${panel ? 'text-text' : ''}`}>
            <SquareTerminal size={13} />
            {terminals.here.length ? `${terminals.here.length} terminal${terminals.here.length > 1 ? 's' : ''}`
              : 'Terminal'}
          </button>) : undefined} />}
      </section>

      {ask && (
        <AskPanel kind={ask.kind} askId={ask.id} onAsk={(id) => setAsk({ kind: ask.kind, id })}
          onClose={() => setAsk(null)} logText={() => file?.text ?? ''}
          onOpenFile={(c, p) => void openFile(c, p)}
          context={file ? { cluster: file.cluster, path: file.path,
            ...(selection.count > 0 ? { from_line: selection.from, to_line: selection.to } : {}) } : null} />
      )}
      {goTo && cluster && <GoToFile cluster={cluster} root={root || '~'} onOpen={openPath} onClose={() => setGoTo(false)} />}
      {dialog}
    </div>
  )
}
