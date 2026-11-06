import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import type { Clip, CopyPlan } from '../../types/files'
import { EDialog, MainButton, Section, Segments } from '../e/ui'
import { Spinner } from '../ui'
import { size } from './format'

const BIG = 5 * 1000 ** 3  // past this, Globus (cluster to cluster) beats streaming through the laptop

export type How = 'laptop' | 'globus'
const HOWS = [['laptop', 'Through this laptop'], ['globus', 'Globus']] as const
const HOW_NOTE: Record<How, string> = {
  laptop: 'Keep HPC Hub open and this computer awake until done.',
  globus: 'Cluster to cluster, keeps going with the app closed.',
}

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
      .then((p) => {
        setPlan(p)
        if (p.sizes.reduce((n, s) => n + s.size, 0) > BIG) setHow('globus')  // big: cluster to cluster
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

  return (
    <EDialog title={`Copy ${clip.name} to ${dstName}`} onClose={onClose} width={540}
      actions={<MainButton disabled={!ready} onClick={() => { onClose(); onGo([...left], how, total) }}>Copy
      </MainButton>}>
      <div className="px-5 text-sm text-dim">
        <p className="truncate" title={clip.path}>From {clip.clusterName}: {clip.path}</p>
        <p className="truncate" title={dstDir}>Into {dstName}: {dstDir}</p>
      </div>

      {clip.folder && (
        <Section title="What to copy" note={<>
          {error ? `Could not measure it: ${error}` : !plan ? 'Measuring sizes…'
            : `${size(total)} will be copied. Untick what to leave behind.`}
          {total > BIG && how === 'laptop' && ' That is big. Globus copies it cluster to cluster, much faster.'}
        </>}>
          <div className="max-h-[280px] overflow-auto">
            {!plan && !error && <div className="grid h-12 place-items-center border-b border-line"><Spinner /></div>}
            {plan && !plan.sizes.length && <p className="border-b border-line px-5 py-3 text-dim">
              The folder is empty.</p>}
            {plan?.sizes.map((s) => (
              <label key={s.name} className="flex min-h-11 items-center gap-3 border-b border-line px-5 hover:bg-hover">
                <input type="checkbox" checked={!left.has(s.name)} onChange={() => flip(s.name)}
                  className="size-[18px] accent-[var(--color-accent)]" />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="text-sm tabular-nums text-dim">{size(s.size)}</span>
              </label>
            ))}
          </div>
        </Section>
      )}

      <section className="px-5 pt-5">
        <h3 className="pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">How</h3>
        <Segments label="How" value={how} onChange={setHow} options={HOWS} />
        <p className="pt-2 text-sm text-dim">{HOW_NOTE[how]}</p>
      </section>
    </EDialog>
  )
}
