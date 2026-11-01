// Go to file (Ctrl+P): type part of a name, pick from the files under the tree's folder.
import { FileCode2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { call } from '../../../rpc'
import type { FoundFile } from '../../../types/code'
import { Dialog, FIELD, Spinner } from '../../ui'

export function GoToFile({ cluster, root, onOpen, onClose }:
  { cluster: string; root: string; onOpen: (path: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<FoundFile[] | null>(null)
  const [error, setError] = useState('')
  const [pick, setPick] = useState(0)
  const asked = useRef(0)

  useEffect(() => {
    const n = ++asked.current
    const t = window.setTimeout(() => {
      setFound(null)
      call<FoundFile[]>('code.find_files', { cluster, root, query })
        .then((f) => { if (n === asked.current) { setFound(f.slice(0, 200)); setPick(0); setError('') } })
        .catch((e: Error) => { if (n === asked.current) { setFound([]); setError(e.message) } })
    }, query ? 200 : 0)
    return () => clearTimeout(t)
  }, [cluster, root, query])

  const choose = (f?: FoundFile) => {
    if (!f) return
    onOpen(f.path)
    onClose()
  }
  const rel = (p: string) => (p.startsWith(root + '/') ? p.slice(root.length + 1) : p)

  return (
    <Dialog title="Go to file" onClose={onClose} width={560}>
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Part of a file name"
        aria-label="File name" className={`${FIELD} w-full`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setPick((p) => Math.min(p + 1, (found?.length ?? 1) - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setPick((p) => Math.max(p - 1, 0)) }
          if (e.key === 'Enter') { e.preventDefault(); choose(found?.[pick]) }
        }} />
      <div className="mt-2 max-h-[50vh] min-h-24 overflow-auto">
        {found === null && <p className="flex items-center gap-2 py-4 text-sm text-dim"><Spinner size={14} /> Looking</p>}
        {error && <p className="py-4 text-sm text-bad">{error}</p>}
        {found && !error && !found.length && <p className="py-4 text-sm text-dim">No file matches.</p>}
        {found?.map((f, i) => (
          <button key={f.path} type="button" onClick={() => choose(f)} onMouseEnter={() => setPick(i)}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left ${i === pick ? 'bg-selected' : ''}`}>
            <FileCode2 size={14} className="shrink-0 text-dim" />
            <span className="shrink-0 font-semibold">{f.name}</span>
            <span className="min-w-0 truncate font-mono text-xs text-dim">{rel(f.path)}</span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}
