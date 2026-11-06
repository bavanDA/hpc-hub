import { useCallback, useLayoutEffect, useState, type ReactNode } from 'react'

import { ScratchBanner } from '../components/backup/ScratchBanner'
import { setActiveCluster, useActiveCluster } from '../components/clusters/active'
import { shortName } from '../components/clusters/loginCopy'
import { ActionBar, type Action } from '../components/files/ActionBar'
import { ClipBanner } from '../components/files/ClipBanner'
import { ContextMenu } from '../components/files/ContextMenu'
import { ConfirmDialog, NameDialog } from '../components/files/dialogs'
import { FolderView } from '../components/files/FolderView'
import { EDIT_LIMIT, isDir, isText, join, kind, parent, sorted } from '../components/files/format'
import { ImageDialog } from '../components/files/ImageDialog'
import { keyAction } from '../components/files/keys'
import { memory } from '../components/files/memory'
import { menuFor } from '../components/files/menu'
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
  const { listing, path, loading, error, places, selected, setSelected, go } = useListing(cluster, connected, clusters)
  const entries = listing ? sorted(listing.entries, sort) : []
  const entry = entries.find((e) => e.name === selected) ?? null

  const refresh = () => go(path)
  const done = (msg: string) => () => { toast(msg); refresh() }
  const failed = (e: Error) => toast(`Failed: ${e.message}`)

  const { local, upload, download, transfers, start } = useCopies({ cluster, here, path, connected, refresh })
  const { clip, drop, copy, paste } = usePaste({ cluster, here, path, connected, sessions, start, setDialog, close })

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
  const folderOf = (e: Entry | null) => (e && isDir(e) ? join(path, e.name) : path)

  const act = (a: Action, e: Entry | null = entry) => {
    if (!e) return
    ({ open, download, rename, zip, delete: remove, copy } as Record<Action, (e: Entry) => void>)[a](e)
  }
  const key = (k: string, e: Entry | null) => {
    if (k === 'Backspace') { go(parent(path)); return true }
    const a = e && keyAction(k)
    if (!a) return false
    act(a, e)
    return true
  }
  const items = menu && menuFor(menu.entry, !!clip, {
    open: () => act('open', menu.entry), edit: () => menu.entry && edit(menu.entry),
    copyPath: () => copyPath(menu.entry), download: () => menu.entry && download(menu.entry), rename: () => act('rename', menu.entry),
    zip: () => act('zip', menu.entry), copy: () => act('copy', menu.entry), delete: () => act('delete', menu.entry),
    newFolder, upload, paste,
    vscode: () => tools.open(cluster, here, 'vscode', folderOf(menu.entry)),
    claude: () => tools.open(cluster, here, 'agent:claude', folderOf(menu.entry)),
    code: () => goPage('code', { cluster, folder: folderOf(menu.entry) }),
  })

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
      {clip && <ClipBanner clip={clip} canPaste={connected && !!path} onPaste={paste} onDrop={drop} />}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <FolderView cluster={active} session={sessions[cluster]} listing={listing} error={error} entries={entries}
            sort={sort} onSort={setSort} selected={selected} onSelect={setSelected} onOpen={open}
            onMenu={(e, x, y) => setMenu({ x, y, entry: e })} onKey={key} />
        </div>
        {connected && preview && entry && !isDir(entry) && (
          <Preview cluster={cluster} dir={path} entry={entry} onOpen={() => open(entry)} onEdit={() => edit(entry)} />
        )}
      </div>
      {connected && <ActionBar entry={entry} onAction={(a) => act(a)} />}
      <Transfers items={transfers.items.filter((t) => !t.finished)} onX={transfers.x} />
      {items && <ContextMenu x={menu.x} y={menu.y} sections={items} onClose={() => setMenu(null)} />}
      {dialog}
      {tools.dialog}
    </div>
  )
}
