// Choose a folder on a cluster, full screen: places as chips, the current folder, its folders as a list. Tap a
// folder to go in, "Choose this folder" to take the one you're in.
import { ArrowUp, Eye, EyeOff, Folder, FolderPlus, Pencil } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Folder as FolderList, Place, Places, ProjectCluster } from '@shared/types/projects'
import { Button, Chips, Field, ListRow, Sheet } from '../../ui'

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
    <Sheet title={`Choose a folder on ${cluster.name}`} onClose={onClose}
      actions={<Button kind="primary" className="flex-1" disabled={!at}
        onClick={() => { if (at) { onClose(); onPick(at.path) } }}>Choose this folder</Button>}>
      <Chips one value={[]} onChange={([path]) => path && load(path)}
        options={jumps.map((p) => [p.path, p.label] as const)} />

      <div className="mt-3 flex items-center gap-1">
        <button aria-label="Up" disabled={!at || at.path === '/'} onClick={() => at && load(parent(at.path))}
          className="grid size-11 shrink-0 place-items-center rounded-full active:bg-hover disabled:opacity-40">
          <ArrowUp size={22} /></button>
        <p className="min-w-0 flex-1 truncate font-mono text-sm" dir="rtl">
          <bdi>{at ? short(at.path, at.home) : start}</bdi></p>
        <button aria-label="Type a path" onClick={() => setTyping(typing === null ? at?.path ?? '' : null)}
          className="grid size-11 shrink-0 place-items-center rounded-full active:bg-hover"><Pencil size={20} /></button>
        <button aria-label={hidden ? 'Hide hidden folders' : 'Show hidden folders'} onClick={() => setHidden(!hidden)}
          className="grid size-11 shrink-0 place-items-center rounded-full active:bg-hover">
          {hidden ? <EyeOff size={20} /> : <Eye size={20} />}</button>
      </div>

      {typing !== null && (
        <form onSubmit={(e) => { e.preventDefault(); if (typing.trim()) load(typing.trim()) }}>
          <Field label="Go to a path" value={typing} autoFocus autoCapitalize="none" autoCorrect="off"
            spellCheck={false} placeholder="~/myproj or /scratch" onChange={(e) => setTyping(e.target.value)} />
        </form>
      )}

      {naming !== null ? (
        <form className="mt-1" onSubmit={(e) => { e.preventDefault(); newFolder() }}>
          <Field label="New folder name" value={naming} autoFocus autoCapitalize="none" autoCorrect="off"
            spellCheck={false} onChange={(e) => setNaming(e.target.value)} />
          <div className="flex gap-3">
            <Button type="button" className="flex-1" onClick={() => setNaming(null)}>Cancel</Button>
            <Button type="submit" kind="primary" className="flex-1" disabled={!naming.trim()}>Create</Button>
          </div>
        </form>
      ) : (
        <ListRow icon={FolderPlus} title="New folder here" onClick={() => setNaming('')} trailing={<span />} />
      )}

      {error && <p className="my-2 select-text rounded-xl bg-bad-bg p-3 text-bad">{error}</p>}
      <div className="divide-y divide-line">
        {loading && !at
          ? <div className="grid h-40 place-items-center"><Spinner size={24} /></div>
          : folders.length === 0
            ? <p className="py-10 text-center text-dim">
                {at && at.folders.length ? `${at.folders.length} hidden folders` : 'No folders here'}</p>
            : folders.map((f) => (
              <ListRow key={f} icon={Folder} title={f} onClick={() => at && load(join(at.path, f))} />
            ))}
      </div>
      {loading && at && <div className="flex justify-center py-2"><Spinner /></div>}
    </Sheet>
  )
}
