// Files on the clusters, like GNOME Files: a folder as a table, a preview beside it, copy and paste between
// clusters with progress below. Spec: hpc_hub/files/ui/.
import { FolderOpen, FolderX, Unplug } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { ActionBar, type Action } from '../components/files/ActionBar'
import { ClipBanner } from '../components/files/ClipBanner'
import { ContextMenu } from '../components/files/ContextMenu'
import { ConfirmDialog, NameDialog } from '../components/files/dialogs'
import { EditorDialog } from '../components/files/EditorDialog'
import { FileTable } from '../components/files/FileTable'
import { useLocalFiles } from '../components/files/local'
import { EDIT_LIMIT, isDir, isText, join, kind, parent, sorted } from '../components/files/format'
import { ImageDialog } from '../components/files/ImageDialog'
import { menuFor } from '../components/files/menu'
import { PasteDialog, type How } from '../components/files/PasteDialog'
import { PathBar } from '../components/files/PathBar'
import { Preview } from '../components/files/Preview'
import { Transfers } from '../components/files/Transfers'
import { useTransfers } from '../components/files/useTransfers'
import { useToast } from '../components/toast'
import { useTools } from '../components/tools/useTools'
import { EmptyState, Spinner } from '../components/ui'
import { useEvent } from '../hooks'
import { usePageParams } from '../nav'
import { call } from '../rpc'
import type { Cluster, Session } from '../types'
import type { Clip, Entry, Listing, Place, Sort, Transfer } from '../types/files'

// Kept while you visit other pages: where you were, what you copied, how you sort
const memory = { cluster: '', paths: {} as Record<string, string>, clip: null as Clip | null,
  sort: { key: 'name', desc: false } as Sort, preview: true }

export function Files() {
  const toast = useToast()
  const [clusters, setClusters] = useState<Cluster[] | null>(null)
  const [sessions, setSessions] = useState<Record<string, Session>>({})
  const params = usePageParams()  // opened from elsewhere: an Open menu, Ask all's answers
  const [cluster, setClusterState] = useState(() => {
    if (params.cluster && params.path) memory.paths[params.cluster] = params.path
    return (memory.cluster = params.cluster || memory.cluster)
  })
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [places, setPlaces] = useState<Place[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [sort, setSortState] = useState<Sort>(memory.sort)
  const [preview, setPreview] = useState(memory.preview)
  const [clip, setClipState] = useState<Clip | null>(memory.clip)
  const [dialog, setDialog] = useState<ReactNode>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry | null } | null>(null)
  const tools = useTools()
  const asked = useRef(0)  // the newest listing asked for; older answers are dropped
  const dests = useRef(new Map<string, { cluster: string; dir: string }>())

  const setCluster = (id: string) => { memory.cluster = id; setClusterState(id) }
  const setSort = (s: Sort) => { memory.sort = s; setSortState(s) }
  const setClip = (c: Clip | null) => { memory.clip = c; setClipState(c) }
  const close = useCallback(() => setDialog(null), [])

  useEffect(() => {
    call<Cluster[]>('clusters.list').then((all) => {
      setClusters(all)
      call<Session[]>('sessions.list').then((list) => {
        const byId = Object.fromEntries(list.map((s) => [s.id, s]))
        setSessions(byId)
        if (!memory.cluster || !all.some((c) => c.id === memory.cluster)) {
          setCluster((all.find((c) => byId[c.id]?.state === 'Connected') ?? all[0])?.id ?? '')
        }
      }).catch(() => { if (!memory.cluster && all[0]) setCluster(all[0].id) })
    }).catch((e: Error) => setError(e.message))
  }, [])
  useEvent<Session>('session', (s) => setSessions((now) => ({ ...now, [s.id]: s })))

  const info = clusters?.find((c) => c.id === cluster)
  const connected = sessions[cluster]?.state === 'Connected'
  const path = listing?.path ?? ''
  const shown = useRef(path)
  useEffect(() => { shown.current = path }, [path])
  const entries = listing ? sorted(listing.entries, sort) : []
  const entry = entries.find((e) => e.name === selected) ?? null

  const go = useCallback((target: string) => {
    if (!cluster) return
    const n = ++asked.current
    setLoading(true)
    call<Listing>('files.list', { cluster, path: target })
      .then((l) => {
        if (n !== asked.current) return
        memory.paths[cluster] = l.path
        if (l.path !== shown.current) setSelected(null)
        setListing(l)
        setError('')
      })
      .catch((e: Error) => {
        if (n !== asked.current) return
        toast(`${clusters?.find((c) => c.id === cluster)?.name ?? cluster}: ${e.message}`)
        if (!shown.current) setError(e.message)
      })
      .finally(() => n === asked.current && setLoading(false))
  }, [cluster, clusters, toast])

  useEffect(() => {  // a new cluster, or it just connected or dropped
    setListing(null)
    setSelected(null)
    setPlaces([])
    setError('')
    if (!connected) return
    go(memory.paths[cluster] ?? '')
    call<Place[]>('files.places', { cluster }).then(setPlaces).catch(() => {})
  }, [cluster, connected, go])

  const refresh = () => go(path)
  const done = (msg: string) => () => { toast(msg); refresh() }
  const failed = (e: Error) => toast(`Failed: ${e.message}`)

  const local = useLocalFiles(cluster, info?.name ?? cluster)
  const upload = () => {
    if (!connected || !path) return
    const into = { cluster, dir: path }
    local.upload(path).then((id) => id && dests.current.set(id, into))
  }
  const download = (e: Entry) => local.download(join(path, e.name))

  const onFinished = (t: Transfer) => {
    if (!local.finished(t)) toast(t.error ? (t.error === 'Cancelled' ? 'Copy cancelled' : `Copy failed: ${t.error}`)
      : `Copied ${t.title.split(':')[0]}`)
    const d = dests.current.get(t.id)
    if (!t.error && d && d.cluster === memory.cluster && d.dir === memory.paths[d.cluster]) refresh()
  }
  const transfers = useTransfers(onFinished)

  // -- actions on an entry ----------------------------------------------------------
  const open = (e: Entry) => {
    const p = join(path, e.name)
    if (isDir(e)) go(p)
    else if (kind(e) === 'image') setDialog(<ImageDialog cluster={cluster} path={p} onClose={close} />)
    else if (isText(e) && e.size < EDIT_LIMIT) edit(e)
    else local.download(p, true)  // no preview here: download and open it, as the GTK app does
  }
  const edit = (e: Entry) => setDialog(
    <EditorDialog cluster={cluster} clusterName={info?.name ?? cluster} path={join(path, e.name)} onClose={close} />)
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
      text={`This permanently deletes it on ${info?.name}${isDir(e) ? ' with everything inside.' : '.'}`}
      onYes={() => call('files.delete', { cluster, path: join(path, e.name) })
        .then(done(`Deleted ${e.name}`)).catch(failed)} />)
  const zip = (e: Entry) => {
    const p = join(path, e.name)
    if (kind(e) === 'archive') {
      toast(`Extracting ${e.name}…`)
      call('files.extract', { cluster, path: p }).then(done(`Extracted ${e.name}`)).catch(failed)
    } else {
      toast(`Zipping ${e.name} on ${info?.name}…`)
      call('files.zip', { cluster, path: p }).then(done(`Zipped ${e.name}`)).catch(failed)
    }
  }
  const copyPath = (e: Entry | null) => {
    const p = e ? join(path, e.name) : path
    navigator.clipboard.writeText(p).then(() => toast(`Copied ${p}`)).catch(() => toast('Could not copy'))
  }
  const folderOf = (e: Entry | null) => (e && isDir(e) ? join(path, e.name) : path)
  const copy = (e: Entry) => setClip({ cluster, clusterName: info?.name ?? cluster, path: join(path, e.name),
    name: e.name, folder: isDir(e) })

  const start = (c: Clip, skip: string[], how: How, total: number) => {
    const into = { cluster, dir: path }
    call<{ id: string }>('files.copy', { src_cluster: c.cluster, src_path: c.path, dst_cluster: cluster,
      dst_dir: path, skip, how, folder: c.folder, total })
      .then(({ id }) => { dests.current.set(id, into); toast(c.cluster === cluster ? `Copying ${c.name}…`
        : how === 'globus' ? 'Sent to Globus. Progress is below' : 'Copying. Progress is below') })
      .catch((e: Error) => toast(`Could not start: ${e.message}`))
  }
  const paste = () => {
    if (!clip) return
    if (!connected || !path) { toast('Open a folder to paste into first'); return }
    if (sessions[clip.cluster]?.state !== 'Connected') {
      toast(`Connect to ${clip.clusterName} first, the copy comes from there`)
      return
    }
    const c = clip
    if (c.cluster === cluster) { setClip(null); start(c, [], 'laptop', 0); return }
    setDialog(<PasteDialog clip={c} dstName={info?.name ?? cluster} dstDir={path} onClose={close}
      onGo={(skip, how, total) => { setClip(null); start(c, skip, how, total) }} />)
  }

  const act = (a: Action, e: Entry | null = entry) => {
    if (!e) return
    ({ open, download, rename, zip, delete: remove, copy } as Record<Action, (e: Entry) => void>)[a](e)
  }
  const key = (k: string, e: Entry | null) => {
    if (k === 'Backspace') { go(parent(path)); return true }
    if (!e) return false
    const map: Record<string, Action> = { Enter: 'open', Delete: 'delete', F2: 'rename' }
    if (map[k]) { act(map[k], e); return true }
    return false
  }
  const items = menu && menuFor(menu.entry, !!clip, {
    open: () => act('open', menu.entry), edit: () => menu.entry && edit(menu.entry),
    copyPath: () => copyPath(menu.entry), download: () => menu.entry && download(menu.entry), rename: () => act('rename', menu.entry),
    zip: () => act('zip', menu.entry), copy: () => act('copy', menu.entry), delete: () => act('delete', menu.entry),
    newFolder, upload, paste,
    vscode: () => tools.open(cluster, info?.name ?? cluster, 'vscode', folderOf(menu.entry)),
    claude: () => tools.open(cluster, info?.name ?? cluster, 'agent:claude', folderOf(menu.entry)),
  })

  if (error && !clusters) return <p className="p-8 text-bad">Could not load clusters: {error}</p>
  if (!clusters) return <div className="grid h-full place-items-center"><Spinner size={24} /></div>

  let body: ReactNode
  if (!connected) {
    body = <EmptyState icon={Unplug} title="Not connected"
      text={`Connect to ${info?.name ?? 'a cluster'} to browse files.`} />
  } else if (!listing) {
    body = error ? <EmptyState icon={FolderX} title="Could not open folder" text={error} />
      : <div className="grid h-full place-items-center"><Spinner size={24} /></div>
  } else if (!entries.length) {
    body = <div className="h-full" onContextMenu={(ev) => { ev.preventDefault(); setMenu({ x: ev.clientX,
      y: ev.clientY, entry: null }) }}><EmptyState icon={FolderOpen} title="Empty folder" /></div>
  } else {
    body = <FileTable entries={entries} sort={sort} onSort={setSort} selected={selected} onSelect={setSelected}
      onOpen={open} onMenu={(e, x, y) => setMenu({ x, y, entry: e })} onKey={key} />
  }

  return (
    <div className="flex h-full flex-col bg-view">
      <PathBar clusters={clusters} sessions={sessions} cluster={cluster} onCluster={setCluster} path={path}
        connected={connected} loading={loading} places={places} count={listing ? entries.length : null}
        preview={preview} onPreview={() => { memory.preview = !preview; setPreview(!preview) }}
        onGo={go} onUp={() => path && go(parent(path))} onRefresh={refresh} onNewFolder={newFolder}
        onUpload={upload} />
      {clip && <ClipBanner clip={clip} canPaste={connected && !!path} onPaste={paste} onDrop={() => setClip(null)} />}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">{body}</div>
        {connected && preview && entry && !isDir(entry) && (
          <Preview cluster={cluster} dir={path} entry={entry} onOpen={() => open(entry)} onEdit={() => edit(entry)} />
        )}
      </div>
      {connected && <ActionBar entry={entry} onAction={(a) => act(a)} />}
      <Transfers items={transfers.items} onX={transfers.x} />
      {items && <ContextMenu x={menu.x} y={menu.y} sections={items} onClose={() => setMenu(null)} />}
      {dialog}
      {tools.dialog}
    </div>
  )
}
