import { FileCode2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { call } from '../../../rpc'
import type { FoundFile } from '../../../types/code'
import { Dialog } from '../../ui/Dialog'
import { FIELD } from '../../ui/field'
import { Spinner } from '../../ui/Spinner'

/** Ctrl+P: type part of a name, pick from the files under the folder. */
export function GoToFile({ cluster, root, onOpen, onClose }:
  { cluster: string; root: string; onOpen: (path: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [found, setFound] = useState<FoundFile[] | null>(null)
  const [error, setError] = useState('')
  const [pick, setPick] = useState(0)
  const asked = useRef(0)
  const waiting = useRef(false)  // Enter while it's still looking: open the first match when it comes

  useEffect(() => {
    const n = ++asked.current
    const t = window.setTimeout(() => {
      setFound(null)
      call<FoundFile[]>('code.find_files', { cluster, root, query })
        .then((f) => {
          if (n !== asked.current) return
          if (waiting.current && f.length) { onOpen(f[0].path); onClose(); return }
          setFound(f.slice(0, 200)); setPick(0); setError('')
        })
        .catch((e: Error) => { if (n === asked.current) { setFound([]); setError(e.message) } })
    }, query ? 200 : 0)
    return () => clearTimeout(t)
  }, [cluster, root, query])  // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (f?: FoundFile) => {
    if (!f) return
    onOpen(f.path)
    onClose()
  }
  const rel = (p: string) => (p.startsWith(root + '/') ? p.slice(root.length + 1) : p)

  return (
    <Dialog title="Go to file" onClose={onClose} width={560}>
      <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setFound(null) }}
        placeholder="Part of a file name"
        aria-label="File name" className={`${FIELD} w-full`}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') waiting.current = false
          if (e.key === 'ArrowDown') { e.preventDefault(); setPick((p) => Math.min(p + 1, (found?.length ?? 1) - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setPick((p) => Math.max(p - 1, 0)) }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (found) choose(found[pick])
            else waiting.current = true
          }
        }} />
      <div className="mt-2 max-h-[50vh] min-h-24 overflow-auto">
        {found === null && <p className="flex items-center gap-2 py-4 text-sm text-dim"><Spinner size={14} /> Looking</p>}
        {error && <p className="py-4 text-sm text-bad">{error}</p>}
        {found && !error && !found.length && <p className="py-4 text-sm text-dim">No file matches.</p>}
        {found?.map((f, i) => (
          <button key={f.path} type="button" onClick={() => choose(f)} onMouseEnter={() => setPick(i)}
            className={`flex min-h-10 w-full items-center gap-2 border-b border-line px-2 text-left ${
              i === pick ? 'bg-selected' : ''}`}>
            <FileCode2 size={14} className="shrink-0 text-dim" />
            <span className="shrink-0 font-medium">{f.name}</span>
            <span className="min-w-0 truncate font-mono text-xs text-dim">{rel(f.path)}</span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}
