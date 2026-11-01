// Before a copy to another cluster: what is inside and how big, so big parts can stay behind, and how it goes:
// Globus, cluster to cluster, or through this phone (the phone's data, and HPC Hub open until done).
import { Globe, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

import { size } from '@shared/components/files/format'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Clip, CopyPlan } from '@shared/types/files'
import { Button, Sheet } from '../../ui'

const BIG = 5 * 1000 ** 3  // past this, Globus beats sending everything through the phone

export type How = 'laptop' | 'globus'  // the backend calls "through this device" laptop

export function PasteSheet({ clip, dstName, dstDir, onGo, onClose }: {
  clip: Clip; dstName: string; dstDir: string; onGo: (skip: string[], how: How, total: number) => void
  onClose: () => void
}) {
  const [plan, setPlan] = useState<CopyPlan | null>(null)
  const [error, setError] = useState('')
  const [left, setLeft] = useState<Set<string>>(new Set())
  const [how, setHow] = useState<How>('laptop')

  useEffect(() => {
    if (!clip.folder) return
    call<CopyPlan>('files.copy_plan', { cluster: clip.cluster, path: clip.path })
      .then((p) => {
        setPlan(p)
        if (p.sizes.reduce((n, s) => n + s.size, 0) > BIG) setHow('globus')
      })
      .catch((e: Error) => setError(e.message))
  }, [clip])

  const total = plan ? plan.sizes.filter((s) => !left.has(s.name)).reduce((n, s) => n + s.size, 0) : 0
  const flip = (name: string) => setLeft((l) => {
    const next = new Set(l)
    if (!next.delete(name)) next.add(name)
    return next
  })
  const ready = !clip.folder || plan !== null || error !== ''
  const go = () => { onClose(); onGo([...left], how, total) }

  return (
    <Sheet title={`Copy ${clip.name}`} onClose={onClose} actions={<>
      <Button className="flex-1" onClick={onClose}>Cancel</Button>
      <Button kind="primary" className="flex-1" disabled={!ready} onClick={go}>Copy</Button></>}>
      <p className="truncate text-sm text-dim">From {clip.clusterName}: {clip.path}</p>
      <p className="mb-4 truncate text-sm text-dim">Into {dstName}: {dstDir}</p>

      {clip.folder && (
        <>
          <h2 className="mb-1 font-bold">What to copy</h2>
          <p className="mb-2 text-sm text-dim">
            {error ? `Could not measure it: ${error}` : !plan ? 'Measuring sizes'
              : `${size(total)} will be copied. Untick what to leave behind.`}</p>
          <div className="mb-5 overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)]">
            {!plan && !error && <div className="grid h-14 place-items-center"><Spinner /></div>}
            {plan && !plan.sizes.length && <p className="p-4 text-sm text-dim">The folder is empty.</p>}
            {plan?.sizes.map((s) => (
              <label key={s.name} className="flex min-h-12 items-center gap-3 border-b border-line px-4
                last:border-0 active:bg-hover">
                <input type="checkbox" checked={!left.has(s.name)} onChange={() => flip(s.name)}
                  className="size-5 accent-[var(--color-accent)]" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-sm tabular-nums text-dim">{size(s.size)}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-2 font-bold">How</h2>
      <div className="flex flex-col gap-2">
        {([['globus', Globe, 'Globus', 'Cluster to cluster. Keeps going with the app closed.'],
          ['laptop', Smartphone, 'Through this phone',
            'Uses your phone\'s data. Keep HPC Hub open until it\'s done.']] as const).map(([k, Icon, t, sub]) => (
          <button key={k} onClick={() => setHow(k)} aria-pressed={how === k}
            className={`flex items-start gap-3 rounded-2xl p-4 text-left ring-1 ${
              how === k ? 'bg-accent/10 ring-accent' : 'bg-card ring-line'}`}>
            <Icon size={22} className={how === k ? 'text-accent-text' : 'text-dim'} />
            <span className="min-w-0">
              <span className="block font-semibold">{t}</span>
              <span className="block text-sm text-dim">{sub}</span>
            </span>
          </button>
        ))}
      </div>
      {how === 'laptop' && total > BIG && (
        <p className="mt-3 rounded-xl bg-warn-bg p-3 text-sm text-warn">
          That's {size(total)} through your phone. Globus copies it cluster to cluster, much faster.</p>
      )}
    </Sheet>
  )
}
