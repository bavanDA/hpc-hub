import { useEffect, useState } from 'react'

import { call } from '../../../rpc'
import type { Maintenance } from '../../../types/clusters'
import { EButton } from '../../e/EButton'
import { Note } from '../../e/Note'
import { human } from '../time'
import { runsInto, shortened, whenText } from './maintenance'

/** Shown when the time asked for runs into booked maintenance: shorten the job to end before it, or keep it and wait.
 *  The choice is yours; nothing changes unless you press Shorten. */
export function MaintenanceNote({ cluster, asked, onShorten }: {
  cluster: string; asked: number; onShorten: (minutes: number) => void
}) {
  const [m, setM] = useState<Maintenance | null>(null)
  const [kept, setKept] = useState<number | null>(null)
  useEffect(() => { call<Maintenance | null>('clusters.maintenance', { cluster }).then(setM).catch(() => setM(null)) }, [cluster])
  if (!m || !runsInto(m, asked) || kept === asked) return null
  if (m.active) return <Note>Maintenance is under way. New jobs wait until it is over.</Note>
  const fits = shortened(m.minutes_left)
  return (
    <div className="pb-3"><Note action={fits > 0 && <div className="flex flex-wrap gap-2">
      <EButton small onClick={() => onShorten(fits)}>Shorten to {human(fits)}</EButton>
      <EButton small kind="quiet" onClick={() => setKept(asked)}>Keep {human(asked)} and wait</EButton>
    </div>}>
      <span className="font-semibold text-text">Maintenance starts {whenText(m)}.</span>{' '}
      A {human(asked)} job can't finish before then, so it would wait until maintenance is over.
      {fits > 0 && ' Shortened, it can start now.'}
    </Note></div>
  )
}
