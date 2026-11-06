import type { Where } from '../git'
import { Building } from './Building'
import { Failed } from './Failed'
import { Kept } from './Kept'
import { Pages } from './Pages'
import { useBuilt } from './useBuilt'

export function Built({ where, main, clusterName, version, against, guard, zoom, what }:
  { where: Where; main: string; clusterName: string; version: string; against: string; guard: (run: () => void) => void
    zoom: number; what: string }) {
  const b = useBuilt(where, main, version, against, guard)
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {b.data ? <Pages data={b.data} zoom={zoom} />
        : <div className="grid flex-1 place-items-center bg-inset p-6">{b.error ? <Failed error={b.error} retry={b.retry} />
          : <Building what={what} clusterName={clusterName} started={b.started} />}</div>}
      {b.data && <Kept clusterName={clusterName} seconds={b.seconds} cached={b.cached} what="Red and blue PDF" />}
    </div>
  )
}
