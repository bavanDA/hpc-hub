// More › Files: a cluster's folders, with everything you can do to them. Tap opens; ⋮ or a long press shows what a
// file or folder offers; the ⋮ at the top is for the folder you are in. "Copy, then paste anywhere" keeps the copy
// at the bottom while you move to another folder or cluster. Quick editing lives in the Code tab.
import {
  ArchiveRestore, ArrowDownUp, ArrowLeftRight, ArrowUp, ClipboardPaste, Code2, Copy, Download, File, FileArchive,
  Folder, FolderInput, FolderPlus, FolderX, MoreVertical, Pencil, Share2, Trash2, Upload, type LucideIcon,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { agentIcon } from '@shared/components/agents/AgentIcon'
import { basename, isArchive, isDir, isText, join, kind, parent, size, sorted, when } from '@shared/components/files/format'
import { useTransfers } from '@shared/components/files/useTransfers'
import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui/Spinner'
import { useGo, usePageParams } from '@shared/nav'
import { call } from '@shared/rpc'
import type { Entry, Listing, Place, Sort } from '@shared/types/files'
import { ScratchBanner } from '../parts/backup/ScratchBanner'
import { shortCluster, wrapPath } from '../parts/code/util'
import { setClip, useClip } from '../parts/files/clip'
import { ClipBanner } from '../parts/files/ClipBanner'
import { download, setLocalNotify, upload } from '../parts/files/local'
import { PasteSheet, type How } from '../parts/files/PasteSheet'
import { FileSheet } from '../parts/FileSheet'
import { Header } from '../parts/Header'
import { useConnected } from '../parts/useConnected'
import {
  ActionSheet, Button, ConfirmSheet, EmptyState, List, MainButton, PickerSheet, PromptSheet, Row as Line, Segments,
  useToast, type SheetAction,
} from '../ui'

// kept while you visit other screens: the folder per cluster and the sort
const memory = { paths: {} as Record<string, string>, sort: { key: 'name', desc: false } as Sort }

const SORTS = [
  { value: 'name', label: 'Name, A to Z' }, { value: 'name-desc', label: 'Name, Z to A' },
  { value: 'mtime-desc', label: 'Newest first' }, { value: 'mtime', label: 'Oldest first' },
  { value: 'size-desc', label: 'Largest first' }, { value: 'size', label: 'Smallest first' },
] as const
const sortValue = (s: Sort) => `${s.key}${s.desc ? '-desc' : ''}`

const ICONS: Record<string, LucideIcon> = { folder: Folder, archive: FileArchive, code: Code2 }

type Dialog =
  | { kind: 'entry'; entry: Entry } | { kind: 'folder' } | { kind: 'sort' } | { kind: 'goto' } | { kind: 'mkdir' }
  | { kind: 'rename'; entry: Entry } | { kind: 'delete'; entry: Entry } | { kind: 'paste' }

/** A long press (half a second without moving) calls onLong instead of the tap. */
function useLongPress(onLong: () => void) {
  const timer = useRef<number>(0)
  const fired = useRef(false)
  const clear = () => window.clearTimeout(timer.current)
  return {
    fired,
    handlers: {
      onPointerDown: () => {
        fired.current = false
        clear()
        timer.current = window.setTimeout(() => { fired.current = true; navigator.vibrate?.(15); onLong() }, 500)
      },
      onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear, onPointerMove: (e: React.PointerEvent) => {
        if (Math.abs(e.movementX) + Math.abs(e.movementY) > 6) clear()
      },
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); fired.current = true; onLong() },
    },
  }
}

function Row({ entry, onOpen, onMenu }: { entry: Entry; onOpen: () => void; onMenu: () => void }) {
  const press = useLongPress(onMenu)
  const k = kind(entry)
  const Icon = ICONS[k] ?? File
  return (
    <div className="flex items-center border-b border-line">
      <button {...press.handlers} onClick={() => !press.fired.current && onOpen()}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 py-2 pl-4 text-left active:bg-pressed">
        <Icon size={22} className="shrink-0 text-dim" />
        <span className="min-w-0 flex-1">
          <span className="block break-all">{entry.name}</span>
          <span className="block text-sm text-dim">
            {isDir(entry) ? when(entry.mtime) : `${size(entry.size)} · ${when(entry.mtime)}`}</span>
        </span>
      </button>
      <button aria-label={`More for ${entry.name}`} onClick={onMenu}
        className="grid size-12 shrink-0 place-items-center text-dim active:bg-pressed"><MoreVertical size={20} /></button>
    </div>
  )
}

export function FilesManager() {
  const { live, current, pick } = useConnected()
  const params = usePageParams()
  const go = useGo()
  const toast = useToast()
  const clip = useClip()
  const id = current?.id ?? ''
  const [places, setPlaces] = useState<Place[]>([])
  const [path, setPathState] = useState(memory.paths[id] ?? '')
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState('')
  const [stamp, setStamp] = useState(0)
  const [sort, setSortState] = useState<Sort>(memory.sort)
  const [viewing, setViewing] = useState<Entry | null>(null)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const close = useCallback(() => setDialog(null), [])

  useEffect(() => { setLocalNotify(toast) }, [toast])
  const { items } = useTransfers((t) => {
    if (t.error || t.title.includes('this computer')) return  // uploads and downloads speak for themselves (local.ts)
    toast(`Copied ${t.title.split(':')[0]}`)
    setStamp((s) => s + 1)  // it may have landed here
  })
  const running = items.filter((t) => !t.finished).length

  const setPath = useCallback((p: string) => { memory.paths[id] = p; setPathState(p) }, [id])
  const setSort = (s: Sort) => { memory.sort = s; setSortState(s) }
  const reload = () => setStamp((s) => s + 1)

  // opened with go('files', { cluster, path }), or another cluster picked
  // each go() brings new params: the same folder link works again after you browsed away
  useEffect(() => { if (params.path && (!params.cluster || params.cluster === id)) setPath(params.path) },
    [params, id, setPath])
  useEffect(() => {
    if (!id) return
    setPathState(params.path && params.cluster === id ? params.path : memory.paths[id] ?? '')
    call<Place[]>('files.places', { cluster: id }).then(setPlaces).catch(() => setPlaces([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  useEffect(() => {
    if (!id) return
    let live = true
    setError('')
    call<Listing>('files.list', { cluster: id, path })
      .then((l) => { if (live) { setListing(l); if (l.path !== path) memory.paths[id] = l.path } })
      .catch((e: Error) => { if (live) { setError(e.message); setListing(null) } })
    return () => { live = false }
  }, [id, path, stamp])

  const here = listing?.path ?? path
  const entries = useMemo(() => (listing ? sorted(listing.entries, sort) : []), [listing, sort])

  if (!current) {
    return <div className="flex h-full flex-col"><Header title="Files" />
      <EmptyState icon={FolderX} title="No cluster connected" text="Connect one to see its files."
        action={<MainButton onClick={() => go('clusters')}>Go to Clusters</MainButton>} /></div>
  }

  const name = current.name
  const short = shortCluster(name)
  const failed = (what: string) => (e: Error) => toast(`Could not ${what}: ${e.message}`)
  const full = (e: Entry) => join(here, e.name)
  const copyPath = (p: string) => copyText(p).then((ok) => toast(ok ? `Copied ${p}` : 'Could not copy'))
  const open = (e: Entry) => (isDir(e) ? setPath(full(e)) : setViewing(e))
  const edit = (e: Entry) => go('code', { cluster: id, path: full(e) })
  const tool = (start: 'vscode' | 'claude', folder: string) => go('agents', { cluster: id, folder, start })
  const zip = (e: Entry) => {
    const p = full(e)
    const extract = isArchive(e)
    toast(extract ? `Extracting ${e.name}` : `Zipping ${e.name}`)
    call(extract ? 'files.extract' : 'files.zip', { cluster: id, path: p })
      .then(() => { toast(extract ? `Extracted ${e.name}` : `Zipped ${e.name}`); reload() })
      .catch(failed(extract ? 'extract it' : 'zip it'))
  }
  const start = (skip: string[], how: How, total: number) => {
    const c = clip
    if (!c) return
    setClip(null)
    call('files.copy', { src_cluster: c.cluster, src_path: c.path, dst_cluster: id, dst_dir: here, skip, how,
      folder: c.folder, total })
      .then(() => toast(c.cluster === id ? `Copying ${c.name}` : how === 'globus' ? `Sent ${c.name} to Globus`
        : `Copying ${c.name} through this phone`))
      .catch(failed('start the copy'))
  }
  const paste = () => {
    if (!clip || !here) return
    if (!live.some((c) => c.id === clip.cluster)) { toast(`Connect to ${shortCluster(clip.clusterName)} first. The copy comes from there.`); return }
    if (clip.cluster === id) start([], 'laptop', 0)
    else setDialog({ kind: 'paste' })
  }

  const entryActions = (e: Entry): SheetAction[] => {
    const dir = isDir(e)
    return [
      { label: 'Open', icon: dir ? FolderInput : File, onPick: () => open(e) },
      ...(isText(e) ? [{ label: 'Edit in Code', icon: Pencil, onPick: () => edit(e) }] : []),
      { label: 'Copy path', icon: Copy, onPick: () => copyPath(full(e)) },
      { label: dir ? 'Download folder' : 'Download', icon: Download, onPick: () => download(id, full(e)) },
      ...(dir ? [] : [{ label: 'Share', icon: Share2, onPick: () => download(id, full(e), 'share') }]),
      { label: 'Rename', icon: Pencil, onPick: () => setDialog({ kind: 'rename', entry: e }) },
      { label: isArchive(e) ? 'Extract here' : 'Make a zip', icon: isArchive(e) ? ArchiveRestore : FileArchive,
        onPick: () => zip(e) },
      { label: 'Copy, then paste anywhere', icon: ArrowLeftRight, onPick: () => {
        setClip({ cluster: id, clusterName: name, path: full(e), name: e.name, folder: dir })
        toast(`Copied ${e.name}. Open a folder and press Paste here`)
      } },
      ...(dir ? [{ label: 'VS Code in the browser', icon: Code2, onPick: () => tool('vscode', full(e)) },
        { label: 'Claude here', icon: agentIcon('claude'), onPick: () => tool('claude', full(e)) }] : []),
      { label: 'Delete', icon: Trash2, danger: true, onPick: () => setDialog({ kind: 'delete', entry: e }) },
    ]
  }
  const folderActions: SheetAction[] = [
    { label: 'New folder', icon: FolderPlus, onPick: () => setDialog({ kind: 'mkdir' }) },
    { label: 'Upload here', icon: Upload, onPick: () => upload(id, here) },
    ...(clip ? [{ label: `Paste ${clip.name} here`, icon: ClipboardPaste, onPick: paste }] : []),
    { label: 'VS Code in the browser', icon: Code2, onPick: () => tool('vscode', here) },
    { label: 'Claude here', icon: agentIcon('claude'), onPick: () => tool('claude', here) },
    { label: 'Go to a folder', icon: FolderInput, onPick: () => setDialog({ kind: 'goto' }) },
    { label: 'Sort', icon: ArrowDownUp, onPick: () => setDialog({ kind: 'sort' }) },
    { label: 'Copy path', icon: Copy, onPick: () => copyPath(here) },
  ]

  return (
    <div className="flex h-full flex-col">
      <Header title="Files">
        <button aria-label="This folder" onClick={() => setDialog({ kind: 'folder' })}
          className="grid size-12 place-items-center rounded-full active:bg-pressed"><MoreVertical size={22} /></button>
      </Header>
      <div className="flex flex-col gap-2 px-4 pb-2">
        {live.length > 1 && <Segments label="Cluster" value={id} options={live.map((c) => [c.id, shortCluster(c.name)] as const)}
          onChange={pick} />}
        {places.length > 1 && <Segments label="Place" value={places.find((p) => p.path === here)?.path ?? ''}
          options={places.map((p) => [p.path, p.label] as const)} onChange={setPath} />}
        <ScratchBanner cluster={id} path={here} places={places}
          onOpen={() => go('backup', { cluster: id, step: 'plan' })} />
      </div>
      <div className="flex items-center gap-1 pr-2 pl-1">
        <button aria-label="Up one folder" disabled={!here || here === '/'} onClick={() => setPath(parent(here))}
          className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed disabled:opacity-40">
          <ArrowUp size={20} /></button>
        <button aria-label="Go to a folder" onClick={() => setDialog({ kind: 'goto' })}
          className="flex min-h-12 min-w-0 flex-1 items-center rounded-[10px] px-1 py-1 text-left text-sm break-words
            text-dim active:bg-pressed">{wrapPath(here || '~')}</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        <List>
          {running > 0 && <Line icon={ArrowLeftRight} label={running === 1 ? '1 copy running' : `${running} copies running`}
            opens onPress={() => go('files', { tab: 'transfers' })} />}
          {listing && entries.map((e) => <Row key={e.name} entry={e} onOpen={() => open(e)}
            onMenu={() => setDialog({ kind: 'entry', entry: e })} />)}
        </List>
        {error && <EmptyState icon={FolderX} title="Can't open this folder" text={error}
          action={<Button onClick={() => setPath('')}>Go to home</Button>} />}
        {!listing && !error && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
        {listing && !entries.length && <p className="p-4 text-center text-dim">This folder is empty.</p>}
      </div>
      {clip && <ClipBanner clip={clip} canPaste={!!here && !error} onPaste={paste} onDrop={() => setClip(null)} />}

      {viewing && <FileSheet cluster={id} path={full(viewing)} size={viewing.size} onClose={() => setViewing(null)}
        onEdit={isText(viewing) ? () => { setViewing(null); edit(viewing) } : undefined}
        onDownload={() => download(id, full(viewing))} onShare={() => download(id, full(viewing), 'share')} />}
      {dialog?.kind === 'entry' && <ActionSheet title={dialog.entry.name} actions={entryActions(dialog.entry)}
        onClose={close} />}
      {dialog?.kind === 'folder' && <ActionSheet title={basename(here) || here} actions={folderActions}
        onClose={close} />}
      {dialog?.kind === 'sort' && <PickerSheet title="Sort" value={sortValue(sort)} onClose={close}
        options={SORTS.map((s) => ({ value: s.value, label: s.label }))}
        onPick={(v) => setSort({ key: v.replace('-desc', '') as Sort['key'], desc: v.endsWith('-desc') })} />}
      {dialog?.kind === 'goto' && <PromptSheet title="Go to a folder" label="Folder" value={here}
        placeholder="/scratch/jdoe" confirm="Go" onClose={close} onSubmit={setPath} />}
      {dialog?.kind === 'mkdir' && <PromptSheet title="New folder" label="Name" confirm="Make it" onClose={close}
        onSubmit={(n) => call('files.mkdir', { cluster: id, path: here, name: n })
          .then(() => { toast(`Made ${n}`); reload() }).catch(failed('make the folder'))} />}
      {dialog?.kind === 'rename' && <PromptSheet title={`Rename ${dialog.entry.name}`} label="New name"
        value={dialog.entry.name} confirm="Rename" onClose={close}
        onSubmit={(n) => call('files.rename', { cluster: id, path: full(dialog.entry), name: n })
          .then(() => { toast(`Renamed to ${n}`); reload() }).catch(failed('rename it'))} />}
      {dialog?.kind === 'delete' && <ConfirmSheet danger keep="Keep it" confirm="Delete" title={`Delete ${dialog.entry.name}?`}
        text={`There's no trash on ${short}, so it's gone for good.`} onClose={close}
        onConfirm={() => call('files.delete', { cluster: id, path: full(dialog.entry) })
          .then(() => { toast(`Deleted ${dialog.entry.name}`); reload() }).catch(failed('delete it'))} />}
      {dialog?.kind === 'paste' && clip && <PasteSheet clip={clip} dstName={name} dstDir={here} onClose={close}
        onGo={start} />}
    </div>
  )
}
