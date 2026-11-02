// Choose a folder on a cluster, full screen: your places (home, scratch, project space), then tap folders to go in,
// and "Use this folder" at the bottom. The same calls as the desktop's folder picker.
import { ArrowUp, Folder, FolderPlus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { shortName } from '@shared/components/clusters/loginCopy'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Folder as FolderList, Place, Places } from '@shared/types/projects'
import { Button, Chips, Field, List, MainButton, Row, SearchField, Sheet } from '../../ui'

const join = (a: string, b: string) => `${a.replace(/\/+$/, '')}/${b}`
const parent = (p: string) => p.replace(/\/+$/, '').replace(/\/[^/]*$/, '') || '/'

/** /home/jdoe/x -> ~/x */
export const tilde = (path: string, home: string) =>
  home && (path === home || path.startsWith(home + '/')) ? '~' + path.slice(home.length) : path

const SQUARE = 'grid size-12 shrink-0 place-items-center rounded-lg border border-line-strong text-dim active:bg-pressed'

export function FolderSheet({ cluster, name, start, onPick, onClose }: {
  cluster: string; name: string; start: string; onPick: (path: string) => void; onClose: () => void
}) {
  const [places, setPlaces] = useState<Place[]>([{ label: 'Home', path: '~' }])
  const [at, setAt] = useState<FolderList | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [naming, setNaming] = useState<string | null>(null)

  const load = useCallback((path: string) => {
    setLoading(true)
    call<FolderList>('projects.browse', { cluster, path })
      .then((f) => { setAt(f); setError(''); setFilter('') })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [cluster])

  useEffect(() => {
    load(start || '~')
    call<Places>('projects.places', { cluster }).then((p) => setPlaces(p.places)).catch(() => {})
  }, [cluster, start, load])

  const create = () => {
    const folder = naming?.trim()
    if (!at || !folder) return
    const path = join(at.path, folder)
    call('projects.mkdir', { cluster, path })
      .then(() => { setNaming(null); load(path) })
      .catch((e: Error) => setError(e.message))
  }

  const here = at ? tilde(at.path, at.home) : ''
  const shown = (at?.folders ?? []).filter((f) => !f.startsWith('.') && f.toLowerCase().includes(filter.toLowerCase()))
  return (
    <Sheet title={`A folder on ${shortName({ name })}`} flush onClose={onClose}
      actions={<MainButton disabled={!at} onClick={() => { onClose(); onPick(here) }}>Use this folder</MainButton>}>
      <div className="px-4">
        <Chips one options={places.map((p) => [p.path, p.label] as const)} value={[]}
          onChange={([p]) => p && load(p)} />
        <div className="mt-2 flex items-center gap-2">
          <button aria-label="Up" disabled={!at || at.path === '/'} onClick={() => at && load(parent(at.path))}
            className={`${SQUARE} disabled:opacity-40`}><ArrowUp size={22} /></button>
          <p className="min-w-0 flex-1 font-mono text-sm break-all">{here || '…'}</p>
          <button aria-label="New folder here" onClick={() => setNaming('')} className={SQUARE}>
            <FolderPlus size={22} /></button>
      </div>
      {naming !== null && (
        <div className="mt-2 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="New folder" autoFocus value={naming} autoCapitalize="none" autoCorrect="off"
              spellCheck={false} onChange={(e) => setNaming(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && create()} />
          </div>
          <Button className="mb-2" disabled={!naming.trim()} onClick={create}>Create</Button>
        </div>
      )}
      {(at?.folders.length ?? 0) > 12 && <div className="mt-3"><SearchField value={filter} onChange={setFilter}
        placeholder="Filter folders" /></div>}
      {error && <p className="mt-3 text-bad">{error}</p>}
      </div>
      {loading && !at && <div className="grid h-40 place-items-center"><Spinner size={24} /></div>}
      {at && !shown.length && <p className="py-8 text-center text-dim">No folders here</p>}
      {at && shown.length > 0 && (
        <List className="mt-3">
          {shown.map((f) => <Row key={f} icon={Folder} label={f} opens onPress={() => load(join(at.path, f))} />)}
        </List>
      )}
    </Sheet>
  )
}
