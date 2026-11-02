// Before a copy to another cluster: what is inside and how big, so big parts can stay behind, and how it goes:
// Globus, cluster to cluster, or through this phone (the phone's data, and HPC Hub open until done).
import { Check, Globe, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

import { size } from '@shared/components/files/format'
import { Spinner } from '@shared/components/ui'
import { call } from '@shared/rpc'
import type { Clip, CopyPlan } from '@shared/types/files'
import { MainButton, Row, Sheet } from '../../ui'
import { shortCluster, wrapPath } from '../code/util'

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

  const where = (cluster: string, path: string) => wrapPath(`${shortCluster(cluster)}: ${path}`)
  return (
    <Sheet flush title={`Copy ${clip.name}`} onClose={onClose}
      actions={<MainButton disabled={!ready} onClick={go}>{total ? `Copy ${size(total)}` : 'Copy'}</MainButton>}>
      <div className="border-t border-line">
        <Row label="From" value={where(clip.clusterName, clip.path)} />
        <Row label="Into" value={where(dstName, dstDir)} />
      </div>

      {clip.folder && (
        <section className="pt-5">
          <h3 className="px-4 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">What to copy</h3>
          <div className="border-t border-line">
            {!plan && !error && <div className="grid h-14 place-items-center"><Spinner /></div>}
            {error && <p className="px-4 py-3 text-bad">Couldn't measure it: {error}</p>}
            {plan && !plan.sizes.length && <p className="px-4 py-3 text-dim">The folder is empty.</p>}
            {plan?.sizes.map((s) => (
              <label key={s.name} className="flex min-h-14 items-center gap-3 border-b border-line px-4 active:bg-pressed">
                <input type="checkbox" checked={!left.has(s.name)} onChange={() => flip(s.name)}
                  className="size-5 shrink-0 accent-[var(--color-accent)]" />
                <span className="min-w-0 flex-1 break-all">{s.name}</span>
                <span className="font-medium tabular-nums">{size(s.size)}</span>
              </label>
            ))}
          </div>
          {plan && plan.sizes.length > 0 && <p className="px-4 pt-2 text-sm text-dim">Untick what stays behind.</p>}
        </section>
      )}

      <section className="pt-5">
        <h3 className="px-4 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">How</h3>
        <div className="border-t border-line">
          {([['globus', Globe, 'Globus', 'Cluster to cluster. Keeps going with the app closed.'],
            ['laptop', Smartphone, 'Through this phone',
              'Uses your phone\'s data. Keep HPC Hub open until it\'s done.']] as const).map(([k, Icon, t, sub]) => (
            <Row key={k} icon={Icon} label={t} sub={sub} onPress={() => setHow(k)}>
              {how === k && <Check size={20} aria-label="Chosen" className="shrink-0" />}
            </Row>
          ))}
        </div>
        {how === 'laptop' && total > BIG && (
          <p className="px-4 pt-2 text-sm text-dim">
            That's {size(total)} through your phone. Globus is much faster for this much.</p>
        )}
      </section>
    </Sheet>
  )
}
