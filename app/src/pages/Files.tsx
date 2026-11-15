import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'

import { inTauri } from '../components/app/platform'
import { ScratchBanner } from '../components/backup/ScratchBanner'
import { setActiveCluster, useActiveCluster } from '../components/clusters/active'
import { shortName } from '../components/clusters/loginCopy'
import { ActionBar, type Action } from '../components/files/ActionBar'
import { ClipBanner } from '../components/files/ClipBanner'
import { ConfirmDialog } from '../components/files/ConfirmDialog'
import { ContextMenu } from '../components/files/ContextMenu'
import { DropCover } from '../components/files/DropCover'
import { FolderView } from '../components/files/FolderView'
import { EDIT_LIMIT, isDir, isText, join, kind, parent, sorted } from '../components/files/format'
import { ImageDialog } from '../components/files/ImageDialog'
import { keyAction } from '../components/files/keys'
import { memory } from '../components/files/memory'
import { menuFor } from '../components/files/menu'
import { NameDialog } from '../components/files/NameDialog'
import { PathBar } from '../components/files/PathBar'
import { Preview } from '../components/files/Preview'
import { Transfers } from '../components/files/Transfers'
import { useCopies } from '../components/files/useCopies'
import { useListing } from '../components/files/useListing'
import { usePaste } from '../components/files/usePaste'
import { PdfDialog } from '../components/pdf/PdfDialog'
import { useTools } from '../components/tools/useTools'
import { Spinner } from '../components/ui/Spinner'
import { useToast } from '../components/useToast'
import { useGo, usePageParams } from '../nav'
import { call } from '../rpc'
import type { Entry, Sort } from '../types/files'

export function Files() {
  const toast = useToast()
  const goPage = useGo()
  const params = usePageParams()  // opened from elsewhere: an Open menu, Ask all's answers
  useLayoutEffect(() => {  // opened for a cluster and folder: go there
    if (params.cluster && params.path) memory.paths[params.cluster] = params.path
    if (params.cluster) setActiveCluster(params.cluster)
  }, [params.cluster, params.path])
  const { clusters, sessions, cluster: active, error: clustersError } = useActiveCluster()
  const cluster = memory.cluster = active?.id ?? ''
  const [sort, setSortState] = useState<Sort>(memory.sort)
  const [preview, setPreview] = useState(memory.preview)
  const [dialog, setDialog] = useState<ReactNode>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry | null } | null>(null)
  const tools = useTools()

  const setSort = (s: Sort) => { memory.sort = s; setSortState(s) }
  const close = useCallback(() => setDialog(null), [])

  const here = active ? shortName(active) : cluster
  const connected = !!sessions[cluster]?.connected
  const { listing, path, loading, error, places, selected, picked, pickRows, go } =
    useListing(cluster, connected, clusters)
  const entries = listing ? sorted(listing.entries, sort) : []
  const chosen = entries.filter((e) => picked.has(e.name))
  const entry = chosen.length === 1 ? chosen[0] : null  // the one a preview, rename or open works on

  const refresh = () => go(path)
  const done = (msg: string) => () => { toast(msg); refresh() }
  const failed = (e: Error) => toast(`Failed: ${e.message}`)

  const { local, upload, uploadPaths, download, transfers, start } =
    useCopies({ cluster, here, path, connected, refresh })
  const moveInto = (paths: string[], folder: string) => {
    const what = paths.length === 1 ? paths[0].split('/').pop() : `${paths.length} items`
    call<string[]>('files.move', { cluster, paths, folder })
      .then((why) => {
        toast(why.length ? `Not moved: ${why.join('; ')}` : `Moved ${what} to ${folder.split('/').pop() || folder}`)
        refresh()
      })
      .catch(failed)
  }
  const { held, drop, hold, paste } =
    usePaste({ cluster, here, path, connected, sessions, start, moveInto, setDialog, close })

  /** Paste: files copied on this computer upload here; otherwise what Copy or Move put aside comes here. */
  const pasteAny = async () => {
    if (!connected || !path) { toast('Open a folder to paste into first'); return }
    let found: string[] = []
    try {
      found = inTauri ? await call<string[]>('files.copied_here') : []
    } catch (e) {
      if (!held) { toast((e as Error).message); return }
    }
    if (found.length) uploadPaths(found)
    else if (held) paste()
    else toast('Nothing to paste. Copy files on this computer, or Copy or Move files here, first')
  }
  const pasteRef = useRef(pasteAny)
  pasteRef.current = pasteAny

  useEffect(() => {  // Ctrl+V (⌘V) anywhere on the page but in a text box
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.key.toLowerCase() !== 'v' || ev.shiftKey || ev.altKey) return
      const t = ev.target as HTMLElement | null
      if (t?.closest('input, textarea, [contenteditable="true"], [role="dialog"]')) return
      ev.preventDefault()
      void pasteRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // files dragged here from this computer upload into the open folder
  const [dropping, setDropping] = useState(false)
  const dropTo = useRef({ ok: false, upload: uploadPaths })
  dropTo.current = { ok: connected && !!path, upload: uploadPaths }
  useEffect(() => {
    if (!inTauri) return
    let off: (() => void) | undefined
    let gone = false
    import('@tauri-apps/api/webview').then(({ getCurrentWebview }) => getCurrentWebview().onDragDropEvent((ev) => {
      const p = ev.payload
      if (p.type === 'enter') setDropping(dropTo.current.ok && p.paths.length > 0)  // rows dragged here carry none
      else if (p.type === 'leave') setDropping(false)
      else if (p.type === 'drop') {
        setDropping(false)
        if (dropTo.current.ok && p.paths.length) dropTo.current.upload(p.paths)
      }
    })).then((f) => { if (gone) f(); else off = f }).catch(() => {})
    return () => { gone = true; off?.() }
  }, [])

  const open = (e: Entry) => {
    const p = join(path, e.name)
    if (isDir(e)) go(p)
    else if (kind(e) === 'image') setDialog(<ImageDialog cluster={cluster} path={p} onClose={close} />)
    else if (kind(e) === 'pdf') {
      setDialog(<PdfDialog cluster={cluster} path={p} subtitle={`${here}: ${p}`} onClose={close} />)
    }
    else if (isText(e) && e.size < EDIT_LIMIT) edit(e)
    else local.download(p, true)  // no preview here: download and open it
  }
  const edit = (e: Entry) => goPage('code', { cluster, path: join(path, e.name) })
  const rename = (e: Entry) => setDialog(
    <NameDialog title={`Rename ${e.name}`} action="Rename" initial={e.name} onClose={close}
      onDone={(n) => call('files.rename', { cluster, path: join(path, e.name), name: n })
        .then(done(`Renamed to ${n}`)).catch(failed)} />)
  const newFolder = () => {
    if (!connected || !path) return
    setDialog(<NameDialog title="New folder" action="Create" onClose={close}
      onDone={(n) => call('files.mkdir', { cluster, path, name: n }).then(done(`Created ${n}`)).catch(failed)} />)
  }
  const remove = (e: Entry) => setDialog(
    <ConfirmDialog title={`Delete ${e.name}?`} action="Delete" onClose={close}
      text={`This permanently deletes it on ${here}${isDir(e) ? ' with everything inside.' : '.'}`}
      onYes={() => call('files.delete', { cluster, path: join(path, e.name) })
        .then(done(`Deleted ${e.name}`)).catch(failed)} />)
  const zip = (e: Entry) => {
    const p = join(path, e.name)
    if (kind(e) === 'archive') {
      toast(`Extracting ${e.name}…`)
      call('files.extract', { cluster, path: p }).then(done(`Extracted ${e.name}`)).catch(failed)
    } else {
      toast(`Zipping ${e.name} on ${here}…`)
      call('files.zip', { cluster, path: p }).then(done(`Zipped ${e.name}`)).catch(failed)
    }
  }
  const copyPath = (e: Entry | null) => {
    const p = e ? join(path, e.name) : path
    navigator.clipboard.writeText(p).then(() => toast(`Copied ${p}`)).catch(() => toast('Could not copy'))
  }
  /** Copy or Move puts the picked rows aside. Their paths go on this computer's clipboard too, so a Paste after it
   * pastes these, not files copied earlier on this computer. */
  const holdPicked = (es: Entry[], move: boolean) => {
    if (!es.length) return
    hold(es, move)
    navigator.clipboard?.writeText(es.map((e) => join(path, e.name)).join('\n')).catch(() => {})
    toast(`${move ? 'Moving' : 'Copied'} ${es.length === 1 ? es[0].name : `${es.length} items`}. Open a folder, then `
      + `paste (Ctrl+V)`)
  }
  const removeAll = (es: Entry[]) => {
    if (es.length === 1) { remove(es[0]); return }
    setDialog(<ConfirmDialog title={`Delete ${es.length} items?`} action="Delete" onClose={close}
      text={`This permanently deletes them on ${here}: ${es.map((e) => e.name).join(', ')}.`}
      onYes={async () => {
        const bad: string[] = []
        for (const e of es) {
          await call('files.delete', { cluster, path: join(path, e.name) }).catch(() => bad.push(e.name))
        }
        toast(bad.length ? `Could not delete ${bad.join(', ')}` : `Deleted ${es.length} items`)
        refresh()
      }} />)
  }
  const folderOf = (e: Entry | null) => (e && isDir(e) ? join(path, e.name) : path)

  /** An action on the picked rows; open, rename and zip take one. */
  const act = (a: Action, es: Entry[] = chosen) => {
    if (!es.length) return
    if (a === 'download') download(es)
    else if (a === 'delete') removeAll(es)
    else if (a === 'copy' || a === 'move') holdPicked(es, a === 'move')
    else if (es.length === 1) ({ open, rename, zip } as Record<string, (e: Entry) => void>)[a](es[0])
  }
  const key = (k: string, e: Entry | null) => {
    if (k === 'Backspace') { go(parent(path)); return true }
    if (k === 'Ctrl+C' || k === 'Ctrl+X') { act(k === 'Ctrl+C' ? 'copy' : 'move'); return chosen.length > 0 }
    const a = keyAction(k)
    if (!a || !chosen.length) return false
    act(a, a === 'open' && e ? [e] : chosen)
    return true
  }
  const onMenu = menu?.entry ? (chosen.some((e) => e.name === menu.entry!.name) ? chosen : [menu.entry]) : []
  const items = menu && menuFor(menu.entry, true, {
    open: () => act('open', onMenu), edit: () => menu.entry && edit(menu.entry),
    copyPath: () => copyPath(menu.entry), download: () => act('download', onMenu),
    rename: () => act('rename', onMenu), zip: () => act('zip', onMenu), copy: () => act('copy', onMenu),
    move: () => act('move', onMenu), delete: () => act('delete', onMenu),
    newFolder, upload, paste: () => void pasteAny(),
    vscode: () => tools.open(cluster, here, 'vscode', folderOf(menu.entry)),
    claude: () => tools.open(cluster, here, 'agent:claude', folderOf(menu.entry)),
    code: () => goPage('code', { cluster, folder: folderOf(menu.entry) }),
  }, onMenu.length)

  if (clustersError && !clusters) return <p className="p-8 text-bad">Could not load clusters: {clustersError}</p>
  if (!clusters || !active) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>

  return (
    <div className="flex h-full flex-col bg-window">
      {connected && <PathBar path={path}
        connected={connected} loading={loading} places={places} count={listing ? entries.length : null}
        preview={preview} onPreview={() => { memory.preview = !preview; setPreview(!preview) }}
        onGo={go} onUp={() => path && go(parent(path))} onRefresh={refresh} onNewFolder={newFolder}
        onUpload={upload} />}
      {connected && <ScratchBanner cluster={cluster} path={path} places={places}
        onOpen={() => goPage('backup', { cluster, step: 'plan' })} />}
      {held && <ClipBanner held={held} canPaste={connected && !!path} onPaste={paste} onDrop={drop} />}
      <div className="flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col">
          <FolderView cluster={active} session={sessions[cluster]} listing={listing} error={error} entries={entries}
            sort={sort} onSort={setSort} selected={selected} picked={picked} onPick={pickRows} onOpen={open}
            onMenu={(e, x, y) => setMenu({ x, y, entry: e })} onKey={key}
            onMoveInto={(names, folder) => moveInto(names.map((n) => join(path, n)), join(path, folder.name))} />
          {dropping && <DropCover where={`${here}: ${path}`} />}
        </div>
        {connected && preview && entry && !isDir(entry) && (
          <Preview cluster={cluster} dir={path} entry={entry} onOpen={() => open(entry)} onEdit={() => edit(entry)} />
        )}
      </div>
      {connected && <ActionBar picked={chosen} onAction={(a) => act(a)} />}
      <Transfers items={transfers.items.filter((t) => !t.finished)} onX={transfers.x} />
      {items && <ContextMenu x={menu.x} y={menu.y} sections={items} onClose={() => setMenu(null)} />}
      {dialog}
      {tools.dialog}
    </div>
  )
}
