import { ArrowUp, Eye, EyeOff, Folder, FolderPlus, HardDrive, House, Pencil } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Folder as FolderList, Place, Places, ProjectCluster } from '../../types/projects'
import { shortName } from '../clusters/loginCopy'
import { EButton } from '../e/EButton'
import { EDialog } from '../e/EDialog'
import { IconBtn } from '../e/IconBtn'
import { SearchField } from '../e/SearchField'
import { Spinner } from '../ui/Spinner'
import { Crumbs } from './Crumbs'

const join = (a: string, b: string) => `${a.replace(/\/+$/, '')}/${b}`
const parent = (p: string) => p.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/'

/** /home/jdoe/x -> ~/x */
function short(path: string, home: string) {
  return home && (path === home || path.startsWith(home + '/')) ? '~' + path.slice(home.length) : path
}

const INPUT = 'h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-window px-3 outline-none '
  + 'placeholder:text-faint focus:border-accent focus:ring-1 focus:ring-accent'

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
    <div className="mb-3">
      <div className="px-2 pb-1 text-xs font-semibold tracking-wide text-dim uppercase">{title}</div>
      {items.map((p) => {
        const Icon = p.label === 'Home' ? House : project ? Folder : HardDrive
        const here = at && (p.path === at.path || (p.path === '~' && at.path === at.home))
        return (
          <button key={title + p.path} title={p.path} onClick={() => go(p.path)}
            className={`flex h-9 w-full items-center gap-2.5 rounded-md px-2 text-left hover:bg-hover ${here
              ? 'bg-selected font-semibold' : ''}`}>
            <Icon size={16} className="shrink-0 text-dim" /><span className="truncate">{p.label}</span>
          </button>
        )
      })}
    </div>
  )

  return (
    <EDialog title={`Choose a folder on ${shortName(cluster)}`} width={860} onClose={onClose}
      actions={<>
        <span className="min-w-0 flex-1 self-center truncate font-mono text-sm text-dim" dir="rtl">
          {target && <bdi>{short(target, at?.home ?? '') === '~' ? 'Home folder' : short(target, at?.home ?? '')}</bdi>}
        </span>
        <EButton kind="primary" disabled={!target} onClick={() => { onClose(); onPick(target) }}>
          {picked ? `Choose ${picked}` : 'Choose this folder'}</EButton>
      </>}>
      <div className="flex h-[440px] gap-4 px-5">
        <nav className="w-[180px] shrink-0 overflow-y-auto border-r border-line pr-3">
          {side('Places', places, false)}
          {side('Projects', projects, true)}
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex items-center gap-1">
            <IconBtn icon={ArrowUp} label="Up one folder" disabled={!at || at.path === '/'}
              onClick={() => at && go(parent(at.path))} />
            {typing
              ? <form className="flex min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); if (typed.trim()) go(typed.trim()) }}>
                  <input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Go to a path"
                    placeholder="~/project or /scratch" spellCheck={false} className={INPUT} /></form>
              : at && <Crumbs path={at.path} home={at.home} go={go} />}
            <IconBtn icon={Pencil} label="Type a path" onClick={() => { setTyped(at?.path ?? ''); setTyping(!typing) }} />
            <IconBtn icon={hidden ? EyeOff : Eye} label={hidden ? 'Hide hidden folders' : 'Show hidden folders'}
              onClick={() => setHidden(!hidden)} />
            <IconBtn icon={FolderPlus} label="New folder here" onClick={() => setNaming('')} />
          </div>
          {(at?.folders.length ?? 0) > 8 && <SearchField value={filter} onChange={setFilter} placeholder="Filter" />}
          {naming !== null && (
            <form className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); newFolder() }}>
              <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="New folder name"
                aria-label="New folder name" spellCheck={false} className={INPUT}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setNaming(null) } }} />
              <EButton type="button" small onClick={() => setNaming(null)}>Don't make it</EButton>
              <EButton type="submit" small kind="primary" disabled={!naming.trim()}>Make folder</EButton>
            </form>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-line">
            {loading && !at ? <div className="grid h-full place-items-center"><Spinner size={24} /></div>
              : shown.length === 0
                ? <p className="grid h-full place-items-center text-dim">
                    {at && at.folders.length ? `${at.folders.length} hidden or filtered` : 'No folders here'}</p>
                : shown.map((f) => (
                  <button key={f} onClick={() => setPicked(picked === f ? '' : f)}
                    onDoubleClick={() => at && go(join(at.path, f))}
                    className={`flex h-10 w-full items-center gap-2.5 border-b border-line px-2.5 text-left ${
                      picked === f ? 'bg-selected font-semibold' : 'hover:bg-hover'}`}>
                    <Folder size={16} className="shrink-0 text-dim" /><span className="truncate">{f}</span>
                  </button>
                ))}
          </div>
          {loading && at && <div className="flex justify-center"><Spinner /></div>}
          {error && <p className="text-bad select-text">{error}</p>}
        </div>
      </div>
    </EDialog>
  )
}
