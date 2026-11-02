// A PDF from a cluster over the whole window. Escape or the X closes it.
import { X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { readFile } from './load'
import { ReadablePdf } from './ReadAloud'

export function PdfDialog({ cluster, path, subtitle, onClose }:
  { cluster: string; path: string; subtitle?: string; onClose: () => void }) {
  const [data, setData] = useState<Uint8Array | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const name = path.split('/').pop() || path
  const source = useMemo(() => ({ cluster, path }), [cluster, path])

  useEffect(() => {
    let live = true
    readFile(cluster, path, (p) => live && setProgress(p))
      .then((d) => live && setData(d)).catch((e: Error) => live && setError(e.message))
    return () => { live = false }
  }, [cluster, path])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target as HTMLElement).closest?.('input')) onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-40 bg-black/40 p-3" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()}
        className="mx-auto flex h-full max-w-[1200px] flex-col overflow-hidden rounded-2xl bg-window shadow-2xl">
        <div className="flex h-12 shrink-0 items-center gap-2 px-2">
          <div className="w-9" />
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-md font-semibold">{name}</div>
            {subtitle && <div className="truncate text-xs text-dim">{subtitle}</div>}
          </div>
          <button aria-label="Close" title="Close" onClick={onClose}
            className="grid size-9 place-items-center rounded-full hover:bg-hover"><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 border-t border-line">
          <ReadablePdf data={data} source={source} zoom="auto" memory={`${cluster}:${path}`} loading={!data} progress={progress}
            message={error ? <p className="text-bad">Could not read the PDF: {error}</p> : undefined} />
        </div>
      </div>
    </div>
  )
}
