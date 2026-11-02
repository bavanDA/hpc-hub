// Choose a folder on a cluster, full screen: places as chips, the current folder, its folders as a list. Tap a
// folder to go in, "Choose this folder" to take the one you're in.
import { ArrowUp, Eye, EyeOff, Folder, FolderPlus, Pencil } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Folder as FolderList, Place, Places, ProjectCluster } from '@shared/types/projects'
import { Button, Chips, Field, List, MainButton, Row, Sheet } from '../../ui'
import { shortCluster, wrapPath } from '../code/util'

const join = (a: string, b: string) => `${a.replace(/\/+$/, '')}/${b}`
const parent = (p: string) => p.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/'

/** /home/jdoe/x -> ~/x */
export function short(path: string, home: string) {
  return home && (path === home || path.startsWith(home + '/')) ? '~' + path.slice(home.length) : path
}

export function FolderPicker({ cluster, start, onPick, onClose, projects = [] }:
  { cluster: ProjectCluster; start: string; onPick: (path: string) => void; onClose: () => void;
    projects?: Place[] }) {
  const [places, setPlaces] = useState<Place[]>([{ label: 'Home', path: '~' }])
  const [at, setAt] = useState<FolderList | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hidden, setHidden] = useState(false)
  const [typing, setTyping] = useState<string | null>(null)
  const [naming, setNaming] = useState<string | null>(null)

  const load = useCallback((path: string) => {
    setLoading(true)
    call<FolderList>('projects.browse', { cluster: cluster.id, path })
      .then((f) => { setAt(f); setError(''); setTyping(null) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [cluster.id])

  useEffect(() => {
    load(start || '~')
    call<Places>('projects.places', { cluster: cluster.id }).then((p) => setPlaces(p.places)).catch(() => {})
  }, [cluster.id, start, load])

  const newFolder = () => {
    const name = naming?.trim()
    if (!at || !name) return
    const path = join(at.path, name)
    call('projects.mkdir', { cluster: cluster.id, path })
      .then(() => { setNaming(null); load(path) })
      .catch((e: Error) => setError(e.message))
  }

  // chips: the cluster's places, then your projects on it; picking one goes there
  const jumps = [...places, ...projects]
  const folders = (at?.folders ?? []).filter((f) => hidden || !f.startsWith('.'))

  return (
    <Sheet flush title={`Choose a folder on ${shortCluster(cluster.name)}`} onClose={onClose}
      actions={<MainButton disabled={!at} onClick={() => { if (at) { onClose(); onPick(at.path) } }}>
        Choose this folder</MainButton>}>
      <div className="px-4">
        <Chips one value={[]} onChange={([path]) => path && load(path)}
          options={jumps.map((p) => [p.path, p.label] as const)} />
      </div>

      <div className="mt-1 flex items-center gap-1 px-1">
        <button aria-label="Up one folder" disabled={!at || at.path === '/'} onClick={() => at && load(parent(at.path))}
          className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed disabled:opacity-40">
          <ArrowUp size={22} /></button>
        <p className="min-w-0 flex-1 py-1 font-mono text-sm break-words">{wrapPath(at ? short(at.path, at.home) : start)}</p>
        <button aria-label="Type a path" onClick={() => setTyping(typing === null ? at?.path ?? '' : null)}
          className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed"><Pencil size={20} /></button>
        <button aria-label={hidden ? 'Hide hidden folders' : 'Show hidden folders'} onClick={() => setHidden(!hidden)}
          className="grid size-12 shrink-0 place-items-center rounded-full text-dim active:bg-pressed">
          {hidden ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      </div>

      {typing !== null && (
        <form className="px-4" onSubmit={(e) => { e.preventDefault(); if (typing.trim()) load(typing.trim()) }}>
          <Field label="Go to a path" value={typing} autoFocus autoCapitalize="none" autoCorrect="off"
            spellCheck={false} placeholder="~/myproj or /scratch" onChange={(e) => setTyping(e.target.value)} />
        </form>
      )}

      {naming !== null && (
        <form className="px-4 pb-3" onSubmit={(e) => { e.preventDefault(); newFolder() }}>
          <Field label="New folder name" value={naming} autoFocus autoCapitalize="none" autoCorrect="off"
            spellCheck={false} onChange={(e) => setNaming(e.target.value)} />
          <div className="flex gap-3">
            <Button type="button" className="flex-1" onClick={() => setNaming(null)}>Don't make it</Button>
            <Button type="submit" className="flex-1" disabled={!naming.trim()}>Make folder</Button>
          </div>
        </form>
      )}

      {error && <p className="px-4 py-2 select-text text-bad">{error}</p>}
      <List>
        {naming === null && <Row icon={FolderPlus} label="New folder here" onPress={() => setNaming('')} />}
        {loading && !at
          ? <div className="grid h-40 place-items-center"><Spinner size={24} /></div>
          : folders.length === 0
            ? <p className="py-10 text-center text-dim">
                {at && at.folders.length ? `${at.folders.length} hidden folders` : 'No folders here'}</p>
            : folders.map((f) => (
              <Row key={f} icon={Folder} label={<span className="break-all">{f}</span>} opens
                onPress={() => at && load(join(at.path, f))} />
            ))}
      </List>
      {loading && at && <div className="flex justify-center py-2"><Spinner /></div>}
    </Sheet>
  )
}

/** A folder as a row's value: "Home folder" for ~, else the path in mono, wrapping after slashes. */
export function folderText(path: string) {
  return path === '~' || path === '~/' ? 'Home folder'
    : <span className="font-mono text-sm break-words">{wrapPath(path)}</span>
}
