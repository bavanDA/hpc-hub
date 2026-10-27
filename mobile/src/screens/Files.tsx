// Files: browse a cluster's folders (Home, Project, Scratch) and look at a file.
import { ArrowUp, File, Folder, FolderX, WifiOff } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EmptyState, Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Entry, Listing, Place } from '@shared/types/files'
import { FileSheet } from '../parts/FileSheet'
import { Header } from '../parts/Header'
import { useConnected } from '../parts/useConnected'
import { Segments } from '../ui'

const parent = (path: string) => path.replace(/\/[^/]+\/?$/, '') || '/'
const sorted = (entries: Entry[]) => [...entries].sort((a, b) =>
  Number(b.kind === 'd') - Number(a.kind === 'd') || a.name.localeCompare(b.name))

function size(n: number) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${i ? n.toFixed(1) : n} ${units[i]}`
}

export function Files() {
  const { live, current, pick } = useConnected()
  const id = current?.id ?? ''
  const [places, setPlaces] = useState<Place[]>([])
  const [path, setPath] = useState('')
  const [listing, setListing] = useState<Listing | null>(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setPath('')
    call<Place[]>('files.places', { cluster: id }).then(setPlaces).catch(() => setPlaces([]))
  }, [id])
  useEffect(() => {
    if (!id) return
    setListing(null)
    setError('')
    call<Listing>('files.list', { cluster: id, path }).then(setListing).catch((e: Error) => setError(e.message))
  }, [id, path])

  if (!current) {
    return <div className="flex h-full flex-col"><Header title="Files" />
      <EmptyState icon={WifiOff} title="Not connected" text="Connect a cluster to see its files." /></div>
  }
  const here = listing?.path ?? path
  return (
    <div className="flex h-full flex-col">
      <Header title="Files" />
      <div className="flex flex-col gap-2 px-4 pb-2">
        {live.length > 1 && <Segments value={id} options={live.map((c) => [c.id, c.name] as const)} onChange={pick} />}
        {places.length > 0 && <Segments value={places.find((p) => p.path === here)?.path ?? ''}
          options={places.map((p) => [p.path, p.label] as const)} onChange={setPath} />}
        <div className="flex items-center gap-2">
          <button aria-label="Up" disabled={!here || here === '/'} onClick={() => setPath(parent(here))}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-pill disabled:opacity-40">
            <ArrowUp size={20} /></button>
          <p className="min-w-0 flex-1 truncate text-left text-sm text-dim [direction:rtl]"><bdi dir="ltr">{here}</bdi></p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {error && <EmptyState icon={FolderX} title="Can't open this folder" text={error} />}
        {!listing && !error && <div className="grid h-40 place-items-center"><Spinner size={28} /></div>}
        {listing && !listing.entries.length && <p className="p-4 text-center text-dim">Empty folder</p>}
        <div className="overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
          {listing && sorted(listing.entries).map((e) => {
            const folder = e.kind === 'd'
            const full = `${here.replace(/\/$/, '')}/${e.name}`
            return (
              <button key={e.name} onClick={() => (folder ? setPath(full) : setOpen(full))}
                className="flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-0
                  active:bg-hover">
                {folder ? <Folder size={22} className="shrink-0 text-accent-text" />
                  : <File size={22} className="shrink-0 text-dim" />}
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                {!folder && <span className="shrink-0 text-sm text-dim">{size(e.size)}</span>}
              </button>
            )
          })}
        </div>
      </div>
      {open && <FileSheet cluster={id} path={open} onClose={() => setOpen(null)} />}
    </div>
  )
}
