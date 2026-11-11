// Files, Browse: the desktop page on a phone (app/src/pages/Files.tsx): the path bar, the table, the action bar and
// running copies under it. A long press is the desktop's right-click menu. Uploads and downloads go through Android
// (parts/files/local.ts) and a file opens in a window instead of the preview pane.
import { useLayoutEffect, useState, type ReactNode } from 'react'
import { FolderOpen, FolderX } from 'lucide-react'

import { setActiveCluster, useActiveCluster } from '@shared/components/clusters/active'
import { ClusterPicker } from '@shared/components/clusters/ClusterPicker'
import { shortName } from '@shared/components/clusters/loginCopy'
import { NotConnected } from '@shared/components/clusters/NotConnected'
import { ActionBar, type Action } from '@shared/components/files/ActionBar'
import { ClipBanner } from '@shared/components/files/ClipBanner'
import { ConfirmDialog } from '@shared/components/files/ConfirmDialog'
import { basename, isDir, isText, join, kind, parent, sorted } from '@shared/components/files/format'
import { memory } from '@shared/components/files/memory'
import { menuFor } from '@shared/components/files/menu'
import { NameDialog } from '@shared/components/files/NameDialog'
import { PathBar } from '@shared/components/files/PathBar'
import { useListing } from '@shared/components/files/useListing'
import { useTransfers } from '@shared/components/files/useTransfers'
import { copyText } from '@shared/components/terminals/xterm'
import { EmptyState } from '@shared/components/ui/EmptyState'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo, usePageParams } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Entry, Sort } from '@shared/types/files'
import { ScratchBanner } from '../parts/backup/ScratchBanner'
import { setClip, useClip } from '../parts/files/clip'
import { FileList, useFolderPress } from '../parts/files/FileList'
import { download, setLocalNotify, upload } from '../parts/files/local'
import { PasteSheet, type How } from '../parts/files/PasteSheet'
import { TransferRow, useStopCopy } from '../parts/files/TransferRow'
import { FileSheet } from '../parts/FileSheet'
import { Header } from '../parts/Header'
import { NoClusters } from '../parts/NoClusters'
import { ActionSheet, BackLayer, useToast, type SheetAction } from '../ui'

export function FilesManager({ tabs }: { tabs?: ReactNode }) {
  const toast = useToast()
  const goPage = useGo()
  const params = usePageParams()  // opened from elsewhere: a job's folder, a project
  useLayoutEffect(() => {  // opened for a cluster and folder: go there
    if (params.cluster && params.path) memory.paths[params.cluster] = params.path
    if (params.cluster) setActiveCluster(params.cluster)
  }, [params.cluster, params.path])
  const { clusters, sessions, cluster: active, session, connected, error: clustersError } = useActiveCluster()
  const cluster = memory.cluster = active?.id ?? ''
  const [sort, setSortState] = useState<Sort>(memory.sort)
  const [dialog, setDialog] = useState<ReactNode>(null)
  const [menu, setMenu] = useState<{ entry: Entry | null } | null>(null)
  const clip = useClip()
  const folderPress = useFolderPress(() => setMenu({ entry: null }))
  const close = () => setDialog(null)
  const setSort = (s: Sort) => { memory.sort = s; setSortState(s) }

  const here = active ? shortName(active) : cluster
  const { listing, path, loading, error, places, selected, setSelected, go } = useListing(cluster, connected, clusters)
  const entries = listing ? sorted(listing.entries, sort) : []
  const entry = entries.find((e) => e.name === selected) ?? null
  const refresh = () => go(path)
  const done = (msg: string) => () => { toast(msg); refresh() }
  const failed = (e: Error) => toast(`Failed: ${e.message}`)

  useLayoutEffect(() => setLocalNotify(toast), [toast])
  const transfers = useTransfers((t) => {
    if (!t.error && path) refresh()  // it may have landed here
    if (t.error || t.title.includes('this computer')) return  // uploads and downloads speak for themselves (local.ts)
    toast(`Copied ${t.title.split(':')[0]}`)
  })
  const running = transfers.items.filter((t) => !t.finished)
  const [stopCopy, stopDialog] = useStopCopy(transfers.x)

  const layer = (node: ReactNode) => setDialog(<BackLayer onBack={close}>{node}</BackLayer>)
  const open = (e: Entry) => {
    if (isDir(e)) { go(join(path, e.name)); return }
    layer(<FileSheet cluster={cluster} path={join(path, e.name)} size={e.size} onClose={close}
      onEdit={isText(e) ? () => { close(); edit(e) } : undefined}
      onDownload={() => download(cluster, join(path, e.name))}
      onShare={() => download(cluster, join(path, e.name), 'share')} />)
  }
  const edit = (e: Entry) => goPage('code', { cluster, path: join(path, e.name) })
  const rename = (e: Entry) => layer(
    <NameDialog title={`Rename ${e.name}`} action="Rename" initial={e.name} onClose={close}
      onDone={(n) => call('files.rename', { cluster, path: join(path, e.name), name: n })
        .then(done(`Renamed to ${n}`)).catch(failed)} />)
  const newFolder = () => {
    if (!connected || !path) return
    layer(<NameDialog title="New folder" action="Create" onClose={close}
      onDone={(n) => call('files.mkdir', { cluster, path, name: n }).then(done(`Created ${n}`)).catch(failed)} />)
  }
  const remove = (e: Entry) => layer(
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
    copyText(p).then((ok) => toast(ok ? `Copied ${p}` : 'Could not copy'))
  }
  const copy = (e: Entry) => setClip({ cluster, clusterName: here, path: join(path, e.name), name: e.name, folder: isDir(e) })
  const folderOf = (e: Entry | null) => (e && isDir(e) ? join(path, e.name) : path)
  const tool = (start: 'vscode' | 'claude', folder: string) => goPage('agents', { cluster, folder, start })

  const startCopy = (skip: string[], how: How, total: number) => {
    const c = clip
    if (!c) return
    setClip(null)
    call('files.copy', { src_cluster: c.cluster, src_path: c.path, dst_cluster: cluster, dst_dir: path, skip, how,
      folder: c.folder, total })
      .then(() => toast(c.cluster === cluster ? `Copying ${c.name}…` : how === 'globus' ? 'Sent to Globus. Progress is in Transfers'
        : 'Copying. Progress is below'))
      .catch((e: Error) => toast(`Could not start: ${e.message}`))
  }
  const paste = () => {
    if (!clip) return
    if (!connected || !path) { toast('Open a folder to paste into first'); return }
    if (!sessions[clip.cluster]?.connected) { toast(`Connect to ${clip.clusterName} first, the copy comes from there`); return }
    if (clip.cluster === cluster) startCopy([], 'laptop', 0)
    else setDialog(<PasteSheet clip={clip} dstName={here} dstDir={path} onClose={close} onGo={startCopy} />)
  }

  const act = (a: Action, e: Entry | null = entry) => {
    if (!e) return
    ({ open, download: (x: Entry) => download(cluster, join(path, x.name)), rename, zip, delete: remove, copy } as
      Record<Action, (e: Entry) => void>)[a](e)
  }
  const on = menu?.entry ?? null  // what was pressed; null: the folder itself
  const items: SheetAction[] = menu ? menuFor(on, !!clip, {
    open: () => act('open', on), edit: () => on && edit(on), copyPath: () => copyPath(on),
    download: () => act('download', on), rename: () => act('rename', on), zip: () => act('zip', on),
    copy: () => act('copy', on), delete: () => act('delete', on), newFolder,
    upload: () => upload(cluster, path), paste,
    vscode: () => tool('vscode', folderOf(on)), claude: () => tool('claude', folderOf(on)),
    code: () => goPage('code', { cluster, folder: folderOf(on) }),
  }).flat().flatMap((m): SheetAction[] => [{ label: m.label, danger: m.danger, onPick: m.onClick },
    ...(m.label === 'Download' && on && !isDir(on)
      ? [{ label: 'Share', onPick: () => download(cluster, join(path, on.name), 'share') }] : [])]) : []

  let body
  if (clusters && !clusters.length) body = <NoClusters />
  else if (clustersError && !clusters) body = <p className="p-8 text-bad">Could not load clusters: {clustersError}</p>
  else if (!clusters || !active) body = <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  else if (!connected) body = <NotConnected cluster={active} session={session} what="files" />
  else if (!listing) {
    body = error ? <EmptyState icon={FolderX} title="Could not open folder" text={error} />
      : <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  } else if (!entries.length) body = <div className="h-full" {...folderPress}><EmptyState icon={FolderOpen} title="Empty folder" /></div>
  else body = <FileList entries={entries} sort={sort} onSort={setSort} selected={selected} onSelect={setSelected}
    onOpen={open} onMenu={(e) => setMenu({ entry: e })} />

  return (
    <div className="flex h-full flex-col bg-window">
      <Header title="Files" chip={<ClusterPicker />} />
      {tabs}
      {connected && <div className="[&_[aria-label=Preview]]:hidden">
        <PathBar path={path} connected={connected} loading={loading} places={places}
          count={listing ? entries.length : null} preview={false} onPreview={() => {}}
          onGo={go} onUp={() => path && go(parent(path))} onRefresh={refresh} onNewFolder={newFolder}
          onUpload={() => path && upload(cluster, path)} />
      </div>}
      {connected && <div className="px-4"><ScratchBanner cluster={cluster} path={path} places={places}
        onOpen={() => goPage('backup', { cluster, step: 'plan' })} /></div>}
      {clip && <ClipBanner clip={clip} canPaste={connected && !!path} onPaste={paste} onDrop={() => setClip(null)} />}
      <div className="flex min-h-0 flex-1 flex-col">{body}</div>
      {connected && <ActionBar entry={entry} onAction={(a) => act(a)} />}
      {running.length > 0 && <div className="max-h-[188px] shrink-0 divide-y divide-line overflow-y-auto border-t border-line bg-window">
        {running.map((t) => <TransferRow key={t.id} t={t} onX={stopCopy} />)}</div>}
      {stopDialog}
      {menu && <ActionSheet title={on?.name ?? (basename(path) || path)} actions={items} onClose={() => setMenu(null)} />}
      {dialog}
    </div>
  )
}
