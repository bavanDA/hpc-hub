// Choose a folder on a cluster, like the desktop file chooser: places, path bar, browse by double-clicking.
import { ArrowUp, Eye, EyeOff, Folder, FolderPlus, HardDrive, House, Pencil } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Folder as FolderList, Place, Places, ProjectCluster } from '../../types/projects'
import { Button, Dialog, IconButton, Spinner } from '../ui'

const join = (a: string, b: string) => `${a.replace(/\/+$/, '')}/${b}`
const parent = (p: string) => p.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/'

/** /home/jdoe/x -> ~/x */
function short(path: string, home: string) {
  return home && (path === home || path.startsWith(home + '/')) ? '~' + path.slice(home.length) : path
}

function Crumbs({ path, home, go }: { path: string; home: string; go: (p: string) => void }) {
  const inHome = home && (path === home || path.startsWith(home + '/'))
  const base = inHome ? home : ''
  const parts = path.slice(base.length).split('/').filter(Boolean)
  const crumb = 'h-8 shrink-0 rounded-md px-2.5 text-base font-semibold'
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto">
      <button onClick={() => go(base || '/')} className={`${crumb} flex items-center gap-1.5 hover:bg-hover`}>
        {inHome ? <><House size={14} /> Home</> : <><HardDrive size={14} /> /</>}
      </button>
      {parts.map((part, i) => (
        <span key={i} className="flex shrink-0 items-center">
          <span className="text-dim">/</span>
          <button onClick={() => go(`${base}/${parts.slice(0, i + 1).join('/')}`)}
            className={`${crumb} ${i === parts.length - 1 ? 'bg-accent text-white' : 'hover:bg-hover'}`}>{part}</button>
        </span>
      ))}
    </div>
  )
}

export function FolderPicker({ cluster, start, onPick, onClose, projects = [] }:
  { cluster: ProjectCluster; start: string; onPick: (path: string) => void; onClose: () => void;
    projects?: Place[] }) {
  const [places, setPlaces] = useState<Place[]>([{ label: 'Home', path: '~' }])
  const [at, setAt] = useState<FolderList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState('')
  const [filter, setFilter] = useState('')
  const [hidden, setHidden] = useState(false)
  const [typing, setTyping] = useState(false)
  const [typed, setTyped] = useState('')
  const [naming, setNaming] = useState<string | null>(null)

  const load = useCallback((path: string) => {
    call<FolderList>('projects.browse', { cluster: cluster.id, path })
      .then((f) => { setAt(f); setError(''); setPicked(''); setFilter(''); setTyping(false) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [cluster.id])
  const go = (path: string) => { setLoading(true); load(path) }

  useEffect(() => {
    load(start || '~')
    call<Places>('projects.places', { cluster: cluster.id }).then((p) => setPlaces(p.places)).catch(() => {})
  }, [cluster.id, start, load])

  const newFolder = () => {
    const name = naming?.trim()
    if (!at || !name) return
    const path = join(at.path, name)
    call('projects.mkdir', { cluster: cluster.id, path })
      .then(() => { setNaming(null); go(path) })
      .catch((e: Error) => setError(e.message))
  }

  const target = at ? (picked ? join(at.path, picked) : at.path) : ''
  const shown = (at?.folders ?? []).filter((f) => (hidden || !f.startsWith('.')) &&
    f.toLowerCase().includes(filter.toLowerCase()))
  const side = (title: string, items: Place[], project: boolean) => items.length > 0 && (
    <div className="mb-2">
      <div className="px-2 pt-2 pb-1 text-sm font-semibold text-dim">{title}</div>
      {items.map((p) => {
        const Icon = p.label === 'Home' ? House : project ? Folder : HardDrive
        return (
          <button key={title + p.path} title={p.path} onClick={() => go(p.path)}
            className="flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left text-base hover:bg-hover">
            <Icon size={16} className="shrink-0" /><span className="truncate">{p.label}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <Dialog title={`Choose a folder on ${cluster.name}`} onClose={onClose} width={860}
      actions={<>
        <span className="mr-auto min-w-0 self-center truncate text-base text-dim" dir="rtl">
          {target && <bdi>Choose: {short(target, at?.home ?? '')}</bdi>}</span>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={!target} onClick={() => { onClose(); onPick(target) }}>Choose</Button>
      </>}>
      <div className="flex h-[440px] gap-3">
        <nav className="w-[190px] shrink-0 overflow-y-auto border-r border-line pr-2">
          {side('Places', places, false)}
          {side('Projects', projects, true)}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <IconButton icon={ArrowUp} label="Up" onClick={() => at && at.path !== '/' && go(parent(at.path))} />
            {typing
              ? <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)}
                  placeholder="Type a path, e.g. ~/project or /scratch" spellCheck={false}
                  onKeyDown={(e) => { if (e.key === 'Enter' && typed.trim()) go(typed.trim()) }}
                  className="h-9 min-w-0 flex-1 rounded-md bg-pill px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
              : at && <Crumbs path={at.path} home={at.home} go={go} />}
            <IconButton icon={Pencil} label="Type a path"
              onClick={() => { setTyped(at?.path ?? ''); setTyping(!typing) }} />
          </div>
          <div className="flex items-center gap-1.5">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter"
              className="h-9 min-w-0 flex-1 rounded-md bg-pill px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
            <IconButton icon={hidden ? EyeOff : Eye} label={hidden ? 'Hide hidden' : 'Show hidden'}
              onClick={() => setHidden(!hidden)} />
            <IconButton icon={FolderPlus} label="New folder here" onClick={() => setNaming('')} />
          </div>
          {naming !== null && (
            <div className="flex items-center gap-2">
              <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="New folder name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') newFolder()
                  if (e.key === 'Escape') { e.stopPropagation(); setNaming(null) }
                }}
                className="h-9 min-w-0 flex-1 rounded-md bg-pill px-3 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus" />
              <Button onClick={() => setNaming(null)}>Cancel</Button>
              <Button kind="suggested" disabled={!naming.trim()} onClick={newFolder}>Create</Button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-view p-1">
            {loading && !at ? <div className="grid h-full place-items-center"><Spinner size={24} /></div>
              : shown.length === 0
                ? <p className="grid h-full place-items-center text-dim">
                    {at && at.folders.length ? `${at.folders.length} hidden or filtered` : 'No folders here'}</p>
                : shown.map((f) => (
                  <button key={f} onClick={() => setPicked(picked === f ? '' : f)}
                    onDoubleClick={() => at && go(join(at.path, f))}
                    className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left ${
                      picked === f ? 'bg-accent text-white' : 'hover:bg-hover'}`}>
                    <Folder size={16} className="shrink-0" /><span className="truncate">{f}</span>
                  </button>
                ))}
          </div>
          {loading && at && <div className="flex justify-center"><Spinner /></div>}
          {error && <p className="select-text text-base text-bad">{error}</p>}
        </div>
      </div>
    </Dialog>
  )
}
