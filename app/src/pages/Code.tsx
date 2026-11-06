import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { setActiveCluster, useActiveCluster } from '../components/clusters/active'
import { shortName } from '../components/clusters/loginCopy'
import { runningCount, unseenCount, useAsks } from '../components/code/ask'
import { AskPanel } from '../components/code/desktop/AskPanel'
import { BannerRow } from '../components/code/desktop/Banner'
import { CompareDialog } from '../components/code/desktop/Compare'
import { EditorPane } from '../components/code/desktop/EditorPane'
import { FileBar } from '../components/code/desktop/FileBar'
import { FindBar } from '../components/code/desktop/FindBar'
import { useFolderSessions } from '../components/code/desktop/folderSessions'
import { GoToFile } from '../components/code/desktop/GoToFile'
import { closeFolderTerminals } from '../components/code/desktop/panel'
import { folderName, inside } from '../components/code/desktop/paths'
import { readOnlyKeys } from '../components/code/desktop/readOnly'
import { Start } from '../components/code/desktop/Start'
import { StatusLine, type Look } from '../components/code/desktop/StatusLine'
import { Switcher } from '../components/code/desktop/Switcher'
import { Tabs } from '../components/code/desktop/Tabs'
import { TerminalPanel } from '../components/code/desktop/TerminalPanel'
import { TerminalToggle } from '../components/code/desktop/TerminalToggle'
import { andList, lineCount, parentDir } from '../components/code/desktop/text'
import { time } from '../components/code/desktop/time'
import { TreePane } from '../components/code/desktop/TreePane'
import { useBanners } from '../components/code/desktop/useBanners'
import { useFollow } from '../components/code/desktop/useFollow'
import { usePageKeys } from '../components/code/desktop/usePageKeys'
import { usePlaces } from '../components/code/desktop/usePlaces'
import { useSave } from '../components/code/desktop/useSave'
import { useTerminalPanel } from '../components/code/desktop/useTerminalPanel'
import { openFolder, rememberFolder } from '../components/code/desktop/workspace'
import { discardDraft } from '../components/code/drafts'
import type { EditorHandle } from '../components/code/Editor'
import { detectIndent, type Lang } from '../components/code/languages'
import { closeFile, getFile, isDirty, openFile, reloadFile, replaceText, selectFile, setCursor, useCode }
  from '../components/code/store'
import { undoAgentChange } from '../components/code/watch'
import { FolderPicker } from '../components/projects/FolderPicker'
import { AlertDialog } from '../components/ui/AlertDialog'
import { useToast } from '../components/useToast'
import { useGo, usePageParams } from '../nav'
import { call } from '../rpc'
import type { AskKind } from '../types/code'

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
  const { panel, setPanel, height, setHeight } = useTerminalPanel(root)
  const handle = useRef<EditorHandle | null>(null)
  const [find, setFind] = useState<string | null>(null)       // the bar is open, with this to start
  const [goTo, setGoTo] = useState(false)
  const [ask, setAsk] = useState<{ kind: AskKind; id: string | null } | null>(null)
  const [selection, setSelection] = useState<{ from: number; to: number; count: number }>({ from: 0, to: 0, count: 0 })
  const [look, setLook] = useState<Look>({ lang: '', indent: '', line: 1, col: 1, selected: 0 })
  const [lang, setLang] = useState<Lang | null>(null)
  const { banners, dropBanner } = useBanners(files)
  const [dialog, setDialog] = useState<ReactNode>(null)
  const close = useCallback(() => setDialog(null), [])

  const file = files.find((f) => f.key === current) ?? null
  const { follow, add: addFollow, toggle: toggleFollow } = useFollow(file)
  const name = (id: string) => shortName(clusters?.find((c) => c.id === id) ?? { name: id })
  const connected = !!sessions[cluster]?.connected
  const { save, compare, takeTheirs } = useSave({ current, name, dropBanner, setDialog, close })

  const setRoot = useCallback((path: string) => {
    rememberFolder(cluster, path)
    setRootState(path)
  }, [cluster])
  useEffect(() => { setRootState(openFolder(cluster)) }, [cluster])
  const project = root ? folderName(root, places.home, places.projects) : ''

  const live = active && connected && root
    ? { id: cluster, name: active.name, node: sessions[cluster]?.node ?? '', job: sessions[cluster]?.job ?? '' } : null
  const terminals = useFolderSessions(live, root)

  // opened from elsewhere: a file (Files' Edit, a job's output), or a folder (a project)
  useEffect(() => {
    if (params.cluster) setActiveCluster(params.cluster)
    if (params.cluster && params.folder) { rememberFolder(params.cluster, params.folder); setRootState(params.folder) }
    if (params.cluster && params.path) {
      const key = `${params.cluster}:${params.path}`
      if (params.readonly) readOnlyKeys.add(key)
      if (params.follow) addFollow(key)
      void openFile(params.cluster, params.path, params.line ? Number(params.line) : undefined)
    }
  }, [params])  // eslint-disable-line react-hooks/exhaustive-deps

  // text that changed from outside the editor (a reload, an accepted change, a restored draft) goes into it
  useEffect(() => {
    const h = handle.current
    if (!file || !h) return
    if (h.text() !== file.text) h.applyText(file.text, { undoable: isDirty(file) })
    if (follow.has(file.key)) h.goto(lineCount(file.text))
  }, [file?.key, file?.version])  // eslint-disable-line react-hooks/exhaustive-deps

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
    setDialog(<AlertDialog title={`Close ${project} without saving?`} keep="Keep it open" act="Close without saving"
      onClose={close} onAct={() => { close(); finish() }}>
      Your edits to {andList(unsaved.map((f) => f.name))} are lost.</AlertDialog>)
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
  usePageKeys({ goTo: () => cluster && setGoTo(true), save: file ? () => void save() : undefined,
    find: file ? openFind : undefined })

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
    const ind = file ? detectIndent(file.text, l.id) : { tabs: false, size: 4 }
    setLook((x) => ({ ...x, lang: l.name, indent: ind.tabs ? 'Tabs' : `Spaces: ${ind.size}` }))
  }

  const banner = file ? banners[file.key] : undefined
  void asks  // redraw the badge as asks change

  return (
    <div className="flex h-full min-h-0 bg-window">
      <TreePane cluster={cluster} active={active} session={sessions[cluster]} root={root} switcher={switcher}
        current={file?.cluster === cluster ? file.path : null} onGoTo={() => setGoTo(true)} onOpen={openPath}
        onOther={(p) => go('files', { cluster, path: parentDir(p) })} />

      <section className="flex min-w-0 flex-1 flex-col">
        {files.length > 0 && <Tabs files={files} current={current} clusterName={name} onPick={selectFile}
          onClose={closeTab} />}
        {file && <FileBar file={file} selection={selection} slurm={lang?.id === 'slurm'}
          following={follow.has(file.key)} asking={!!ask} badge={runningCount() || unseenCount()}
          onExplain={() => setAsk({ kind: 'explain', id: null })} onSubmit={submit}
          onFollow={() => toggleFollow(file.key)}
          onReload={() => (isDirty(file) ? void compare(file, 'merge') : void reloadFile(file.key))}
          onFind={openFind} onAsk={() => setAsk(ask ? null : { kind: 'free', id: null })} onSave={() => void save()} />}
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

        <EditorPane file={file} connected={connected} following={!!file && follow.has(file.key)} handle={handle}
          start={!file && !root ? <Start home={places.home} projects={places.projects} recent={places.recent}
            onOpen={openProject} onBrowse={browse} /> : null}
          onGoTo={() => setGoTo(true)} onSave={() => void save()} onFind={openFind} onSelection={onSelection}
          onLanguage={onLanguage} />
        {root && panel && <TerminalPanel cluster={cluster} live={live} folder={root} name={project} home={places.home}
          sessions={terminals} height={height} onHide={() => setPanel(false)} onHeight={setHeight} />}
        {(root || (file && !file.loading)) && <StatusLine file={file} look={look} folder={root || undefined}
          left={root ? <TerminalToggle shown={panel} count={terminals.here.length} onToggle={() => setPanel(!panel)} />
            : undefined} />}
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
