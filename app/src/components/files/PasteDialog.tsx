// Before a copy to another cluster: what is inside the folder and how big, so big parts can stay behind,
// and how to copy it (through this laptop, or Globus cluster to cluster).
import { Globe, Laptop } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Clip, CopyPlan } from '../../types/files'
import { Button, Dialog, Spinner } from '../ui'
import { size } from './format'

const BIG = 5 * 1000 ** 3  // past this, Globus (cluster to cluster) beats streaming through the laptop

export type How = 'laptop' | 'globus'

export function PasteDialog({ clip, dstName, dstDir, onGo, onClose }:
  { clip: Clip; dstName: string; dstDir: string; onGo: (skip: string[], how: How, total: number) => void;
    onClose: () => void }) {
  const [plan, setPlan] = useState<CopyPlan | null>(null)
  const [error, setError] = useState('')
  const [left, setLeft] = useState<Set<string>>(new Set())
  const [how, setHow] = useState<How>('laptop')

  useEffect(() => {
    if (!clip.folder) return
    call<CopyPlan>('files.copy_plan', { cluster: clip.cluster, path: clip.path })
      .then(setPlan).catch((e: Error) => setError(e.message))
  }, [clip])

  const total = plan ? plan.sizes.filter((s) => !left.has(s.name)).reduce((n, s) => n + s.size, 0) : 0
  const flip = (name: string) => setLeft((l) => {
    const next = new Set(l)
    if (!next.delete(name)) next.add(name)
    return next
  })
  const ready = !clip.folder || plan !== null || error !== ''

  return (
    <Dialog title={`Copy ${clip.name} to ${dstName}`} onClose={onClose} width={540}
      actions={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button kind="suggested" disabled={!ready}
          onClick={() => { onClose(); onGo([...left], how, total) }}>Copy</Button>
      </>}>
      <p className="truncate text-sm text-dim" title={clip.path}>From {clip.clusterName}: {clip.path}</p>
      <p className="mb-3 truncate text-sm text-dim" title={dstDir}>Into {dstName}: {dstDir}</p>

      {clip.folder && (
        <>
          <h3 className="mb-1 font-semibold">What to copy</h3>
          <p className="mb-2 text-sm text-dim">
            {error ? `Could not measure it: ${error}` : !plan ? 'Measuring sizes…'
              : `${size(total)} will be copied. Untick what to leave behind.`}
            {total > BIG && how === 'laptop' && ' That is big: Globus copies it cluster to cluster, much faster.'}
          </p>
          <div className="mb-4 max-h-[280px] divide-y divide-line overflow-auto rounded-xl bg-card
            shadow-[var(--shadow-card)]">
            {!plan && !error && <div className="grid h-14 place-items-center"><Spinner /></div>}
            {plan && !plan.sizes.length && <p className="p-3 text-sm text-dim">The folder is empty.</p>}
            {plan?.sizes.map((s) => (
              <label key={s.name} className="flex h-11 items-center gap-3 px-3 hover:bg-hover">
                <input type="checkbox" checked={!left.has(s.name)} onChange={() => flip(s.name)}
                  className="size-[18px] accent-[var(--color-accent)]" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-sm tabular-nums text-dim">{size(s.size)}</span>
              </label>
            ))}
          </div>
        </>
      )}

      <h3 className="mb-2 font-semibold">How</h3>
      <div className="grid grid-cols-2 gap-2">
        {([['laptop', Laptop, 'Through this laptop', 'Streams it, no setup'],
          ['globus', Globe, 'Globus', 'Cluster to cluster, only what changed']] as const).map(([k, Icon, t, sub]) => (
          <button key={k} onClick={() => setHow(k)}
            className={`flex items-start gap-3 rounded-xl p-3 text-left ring-1 ${
              how === k ? 'bg-accent/15 ring-2 ring-accent' : 'ring-line hover:bg-hover'}`}>
            <Icon size={20} className={`mt-0.5 shrink-0 ${how === k ? 'text-accent-text' : 'text-dim'}`} />
            <span>
              <span className="block font-semibold">{t}</span>
              <span className="block text-sm text-dim">{sub}</span>
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}
