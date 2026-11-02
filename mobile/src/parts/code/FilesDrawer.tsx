// The Code tab's file browser, full screen: pick the cluster, a place (home, project, scratch), walk the folders
// and tap a file to open it. "Go to file" finds a file by name under the folder you're in. A long press offers New
// file, New folder, Rename, Delete and Copy path.
import { CornerLeftUp, File, FilePlus2, Folder, FolderPlus, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { isDir, join, parent, sorted } from '@shared/components/files/format'
import { copyText } from '@shared/components/terminals/xterm'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { FoundFile } from '@shared/types/code'
import type { Entry, Listing, Place } from '@shared/types/files'
import { ActionSheet, Chips, ConfirmSheet, EmptyState, List, PromptSheet, Row, SearchField, Segments, Sheet, useToast }
  from '../../ui'
import { useConnected } from '../useConnected'
import { useLongPress } from '../terminal/useLongPress'
import { shortCluster } from './util'

type Props = {
  start?: { cluster: string; path: string }
  onOpen: (cluster: string, path: string, editing?: boolean) => void
  onClose: () => void
}

type Dialog = { kind: 'entry'; entry: Entry } | { kind: 'new-file' } | { kind: 'new-folder' }
  | { kind: 'rename'; entry: Entry } | { kind: 'delete'; entry: Entry } | null

export function FilesDrawer({ start, onOpen, onClose }: Props) {
  const toast = useToast()
  const { live, current, pick } = useConnected()
  const cluster = live.find((c) => c.id === start?.cluster)?.id ?? current?.id ?? ''
  const [path, setPath] = useState(start?.path ?? '')
  const [places, setPlaces] = useState<Place[]>([])
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<FoundFile[] | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!cluster) return
    call<Place[]>('files.places', { cluster }).then(setPlaces).catch(() => setPlaces([]))
  }, [cluster])

  useEffect(() => {
    if (!cluster) return
    let live = true
    setError('')
    call<Listing>('files.list', { cluster, path })
      .then((l) => { if (live) { setListing(l); setPath(l.path) } })
      .catch((e: Error) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [cluster, path, tick])

  // "Go to file": names under this folder, a moment after you stop typing
  useEffect(() => {
    if (!query.trim() || !listing) { setFound(null); return }
    const t = window.setTimeout(() => {
      call<FoundFile[]>('code.find_files', { cluster, root: listing.path, query: query.trim() })
        .then(setFound).catch(() => setFound([]))
    }, 300)
    return () => clearTimeout(t)
  }, [query, cluster, listing])

  const here = listing?.path ?? path
  const entries = useMemo(() => listing ? sorted(listing.entries.filter((e) => !e.name.startsWith('.')),
    { key: 'name', desc: false }) : [], [listing])
  const crumbs = here.split('/').filter(Boolean)
  const refresh = () => setTick((t) => t + 1)
  const act = (p: Promise<unknown>, done: string) =>
    p.then(() => { toast(done); refresh() }).catch((e: Error) => toast(e.message))

  if (!cluster) {
    return (
      <Sheet title="Open a file" onClose={onClose}>
        <EmptyState icon={Folder} title="No cluster connected" text="Connect one in Clusters to see its files." />
      </Sheet>
    )
  }

  const ICON = 'grid size-12 shrink-0 place-items-center rounded-full active:bg-pressed'
  return (
    <Sheet flush title="Open a file" onClose={onClose}>
      <div className="flex flex-col gap-3 px-4 pb-2">
        {live.length > 1 && <Segments label="Cluster" value={cluster}
          options={live.map((c) => [c.id, shortCluster(c.name)] as const)} onChange={(id) => { pick(id); setPath('') }} />}
        <SearchField value={query} onChange={setQuery} placeholder="Go to file in this folder" />
        {!query && places.length > 1 && (
          <Chips one options={places.map((p) => [p.path, p.label] as const)} value={places.some((p) => p.path === here) ? [here] : []}
            onChange={([p]) => setPath(p)} />
        )}
      </div>
      {!query && (
        <div className="flex items-center gap-1 pl-3 pr-1" aria-label="Folder path">
          <div className="flex min-w-0 flex-1 flex-wrap items-center text-sm">
            <button className="h-12 shrink-0 px-1 text-dim" onClick={() => setPath('/')}>/</button>
            {crumbs.map((c, i) => (
              <button key={i} onClick={() => setPath('/' + crumbs.slice(0, i + 1).join('/'))}
                className={`h-12 min-w-0 px-1 break-all ${i === crumbs.length - 1 ? 'font-semibold' : 'text-dim'}`}>
                {c}{i < crumbs.length - 1 && <span className="pl-1 text-faint">/</span>}</button>
            ))}
          </div>
          <button aria-label="New file here" onClick={() => setDialog({ kind: 'new-file' })} className={ICON}>
            <FilePlus2 size={20} className="text-dim" /></button>
          <button aria-label="New folder here" onClick={() => setDialog({ kind: 'new-folder' })} className={ICON}>
            <FolderPlus size={20} className="text-dim" /></button>
        </div>
      )}

      <List>
        {error && <p className="px-4 py-4 text-bad">{error}</p>}
        {query
          ? found === null
            ? <div className="grid h-24 place-items-center"><Spinner /></div>
            : found.length === 0
              ? <p className="px-4 py-4 text-dim">No file named like that in {crumbs[crumbs.length - 1] ?? '/'}.</p>
              : found.slice(0, 200).map((f) => (
                  <Row key={f.path} icon={Search} label={f.name} sub={folderIn(f.path, here)}
                    onPress={() => onOpen(cluster, f.path)} />
                ))
          : !listing
            ? <div className="grid h-24 place-items-center"><Spinner /></div>
            : <>
                {here !== '/' && <Row icon={CornerLeftUp} label="Up one folder" onPress={() => setPath(parent(here))} />}
                {entries.map((e) => (
                  <EntryRow key={e.name} entry={e} onTap={() => isDir(e) ? setPath(join(here, e.name)) : onOpen(cluster, join(here, e.name))}
                    onLong={() => setDialog({ kind: 'entry', entry: e })} />
                ))}
                {entries.length === 0 && <p className="px-4 py-4 text-dim">This folder is empty.</p>}
              </>}
      </List>

      {dialog?.kind === 'entry' && (
        <ActionSheet title={dialog.entry.name} onClose={() => setDialog(null)} actions={[
          ...(isDir(dialog.entry) ? [] : [{ label: 'Open', onPick: () => onOpen(cluster, join(here, dialog.entry.name)) }]),
          { label: 'New file here', onPick: () => setDialog({ kind: 'new-file' }) },
          { label: 'New folder here', onPick: () => setDialog({ kind: 'new-folder' }) },
          { label: 'Rename', onPick: () => setDialog({ kind: 'rename', entry: dialog.entry }) },
          { label: 'Copy path', onPick: () => void copyText(join(here, dialog.entry.name))
            .then((ok) => toast(ok ? 'Path copied' : "Couldn't copy")) },
          { label: 'Delete', danger: true, onPick: () => setDialog({ kind: 'delete', entry: dialog.entry }) },
        ]} />
      )}
      {dialog?.kind === 'new-file' && (
        <PromptSheet title="New file" label="Name" placeholder="analysis.py" confirm="Create" onClose={() => setDialog(null)}
          onSubmit={(n) => call('code.new_file', { cluster, path: join(here, n), text: '' })
            .then(() => onOpen(cluster, join(here, n), true)).catch((e: Error) => toast(e.message))} />
      )}
      {dialog?.kind === 'new-folder' && (
        <PromptSheet title="New folder" label="Name" confirm="Create" onClose={() => setDialog(null)}
          onSubmit={(n) => act(call('files.mkdir', { cluster, path: here, name: n }), `Made ${n}`)} />
      )}
      {dialog?.kind === 'rename' && (
        <PromptSheet title="Rename" label="New name" value={dialog.entry.name} confirm="Rename" onClose={() => setDialog(null)}
          onSubmit={(n) => act(call('files.rename', { cluster, path: join(here, dialog.entry.name), name: n }), 'Renamed')} />
      )}
      {dialog?.kind === 'delete' && (
        <ConfirmSheet title={`Delete ${dialog.entry.name}?`} text="There's no trash on the cluster, so it's gone for good."
          keep="Keep it" confirm="Delete" danger onClose={() => setDialog(null)}
          onConfirm={() => act(call('files.delete', { cluster, path: join(here, dialog.entry.name) }), 'Deleted')} />
      )}
    </Sheet>
  )
}

/** Where a found file is, under the folder you searched from ("src/model", or nothing when it's right here). */
function folderIn(path: string, root: string) {
  const rel = path.startsWith(root + '/') ? path.slice(root.length + 1) : path
  const at = rel.lastIndexOf('/')
  return at > 0 ? rel.slice(0, at) : undefined
}

function EntryRow({ entry, onTap, onLong }: { entry: Entry; onTap: () => void; onLong: () => void }) {
  const press = useLongPress(onTap, onLong)
  const dir = isDir(entry)
  return (
    <button {...press} className="flex min-h-14 w-full items-center gap-3 border-b border-line px-4 py-2 text-left
      active:bg-pressed">
      {dir ? <Folder size={22} className="shrink-0 text-dim" /> : <File size={22} className="shrink-0 text-dim" />}
      <span className="min-w-0 flex-1 break-all">{entry.name}</span>
    </button>
  )
}
