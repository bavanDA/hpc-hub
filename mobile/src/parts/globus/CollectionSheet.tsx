// Pick the Globus collection that holds a cluster's files: a search, the best match first.
import { useEffect, useRef, useState } from 'react'

import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Collection, GlobusCluster, GlobusStatus } from '@shared/types/globus'
import { Card, ListRow, SearchField, Sheet, useToast } from '../../ui'

type Found = { query: string; results: Collection[] }

export function CollectionSheet({ cluster, onClose, onPicked }:
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
    <Sheet title={`Collection for ${cluster.name}`} onClose={onClose}>
      <SearchField value={query} onChange={setQuery} placeholder="Search, like Expanse or Bouchet" />
      <div className="mt-3">
        {loading && !found && <div className="grid h-24 place-items-center"><Spinner size={24} /></div>}
        {error && <p className="p-2 text-bad">Search failed: {error}</p>}
        {found && !results.length && !error && <p className="p-2 text-dim">Nothing found. Try another word.</p>}
        {results.length > 0 && (
          <Card className="py-1">
            {results.map((c) => (
              <ListRow key={c.id} title={c.name} subtitle={c.owner || 'No owner'} onClick={() => pick(c)}
                trailing={c.best ? <span className="text-sm font-semibold text-accent-text">Best match</span>
                  : c.mine ? <span className="text-sm text-dim">Yours</span> : undefined} />
            ))}
          </Card>
        )}
      </div>
    </Sheet>
  )
}
