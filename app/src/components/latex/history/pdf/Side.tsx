import { useRef } from 'react'

import { shortHash } from '../format'
import type { Where } from '../git'
import { Building } from './Building'
import { Failed } from './Failed'
import { Pages } from './Pages'
import { useBuilt } from './useBuilt'

export function Side({ where, main, clusterName, current, from, to, zoom, guard }:
  { where: Where; main: string; clusterName: string; current: Uint8Array | null; from: string; to: string; zoom: number
    guard: (run: () => void) => void }) {
  const before = useBuilt(where, main, from, null, guard)
  const after = useBuilt(where, main, to, null, guard, !to)
  const right = to ? after.data : current
  const a = useRef<HTMLDivElement>(null), b = useRef<HTMLDivElement>(null)
  const syncing = useRef(false)
  const follow = (src: HTMLDivElement | null, dst: HTMLDivElement | null) => {
    if (!src || !dst || syncing.current) return
    syncing.current = true
    dst.scrollTop = (src.scrollTop / Math.max(1, src.scrollHeight - src.clientHeight)) * (dst.scrollHeight - dst.clientHeight)
    requestAnimationFrame(() => { syncing.current = false })
  }
  const col = (label: string, v: string, st: typeof before, data: Uint8Array | null, box: typeof a, other: typeof a) => (
    <div className="flex min-w-0 flex-1 flex-col border-r border-line last:border-r-0">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-4 text-sm">
        <b>{label}</b> <span className="rounded bg-pill px-1.5 font-mono text-xs">{v ? shortHash(v) : 'Now'}</span>
        {st.data && !st.cached && v && <span className="text-dim">built on {clusterName} in {st.seconds} s, kept</span>}
        {st.cached && v && <span className="text-dim">kept from before</span>}
      </div>
      {data ? <Pages data={data} zoom={zoom} box={box} onScroll={() => follow(box.current, other.current)} />
        : <div className="grid flex-1 place-items-center bg-inset p-6">{st.error ? <Failed error={st.error} retry={st.retry} />
          : <Building what="That version" clusterName={clusterName} started={st.started} />}</div>}
    </div>
  )
  return (
    <div className="flex min-h-0 flex-1">
      {col('Before', from, before, before.data, a, b)}
      {col('After', to, after, right, b, a)}
    </div>
  )
}
