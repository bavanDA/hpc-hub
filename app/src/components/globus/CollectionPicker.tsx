import { Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { call } from '../../rpc'
import type { Collection, GlobusCluster, GlobusStatus } from '../../types/globus'
import { Dialog } from '../ui/Dialog'
import { List } from '../ui/List'
import { Row } from '../ui/Row'
import { Spinner } from '../ui/Spinner'
import { useToast } from '../useToast'

type Found = { query: string; results: Collection[] }

export function CollectionPicker({ cluster, onClose, onPicked }:
  { cluster: GlobusCluster; onClose: () => void; onPicked: (s: GlobusStatus) => void }) {
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<Found | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const latest = useRef('')

  const run = (text: string) => {
    latest.current = text
    setLoading(true)
    call<Found>('globus.collections', { cluster: cluster.id, query: text })
      .then((f) => {
        if (latest.current !== text) return
        setFound(f)
        setError('')
        if (!text) setQuery(f.query)  // the first search uses the cluster's own name
      })
      .catch((e: Error) => latest.current === text && setError(e.message))
      .finally(() => latest.current === text && setLoading(false))
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => run(''), [])
  useEffect(() => {
    if (query.trim().length < 3 || query === found?.query) return
    const t = setTimeout(() => run(query.trim()), 400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const pick = (c: Collection) => {
    call<GlobusStatus>('globus.set_collection', { cluster: cluster.id, id: c.id, name: c.name })
      .then((s) => { toast(`${cluster.name} uses ${c.name}`); onPicked(s) })
      .catch((e: Error) => toast(`Could not save: ${e.message}`))
  }

  const results = found?.results ?? []
  return (
    <Dialog title={`Globus collection for ${cluster.name}`} onClose={onClose} width={560}>
      <div className="flex flex-col gap-3 pt-1">
        <label className="flex h-9 items-center gap-2 rounded-md bg-pill px-3 focus-within:ring-2
          focus-within:ring-accent">
          <Search size={16} className="text-dim" />
          <input autoFocus value={query} spellCheck={false} placeholder="Search by name"
            onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run(query.trim())}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-dim" />
          {loading && <Spinner size={14} />}
        </label>
        <div className="max-h-[420px] min-h-[120px] overflow-auto pb-1">
          {error ? <List><Row title="Search failed" subtitle={error} /></List>
            : found && !results.length ? <List><Row title="Nothing found" subtitle="Try another word" /></List>
            : results.length > 0 && (
              <List>
                {results.map((c) => (
                  <Row key={c.id} title={c.name} subtitle={`${c.owner || 'No owner'} · ${c.id}`} onClick={() => pick(c)}
                    suffix={c.best ? <span className="text-sm font-semibold text-accent-text">Best match</span>
                      : c.mine ? <span className="text-sm text-dim">Yours</span> : undefined} />
                ))}
              </List>
            )}
        </div>
      </div>
    </Dialog>
  )
}
