// A thin strip at the top of Clusters and Terminals (the desktop's sidebar footer): each connected cluster, its node
// and the time left on it. Tapping a cluster opens Clusters. The time left comes from app/watch.ts, which looks at
// your jobs once a minute; only one strip runs that look, however many are on screen.
import { useEffect, useState } from 'react'

import { leftText, useTimeLeft, useWatch } from '@shared/components/app/watch'
import { useClusters } from '@shared/components/clusters/store'
import { useGo } from '@shared/nav'
import type { Session } from '@shared/types/clusters'

let owner = 0  // the strip that runs the look, by mount id
let next = 0

function Watcher() {
  useWatch()
  return null
}

function Item({ name, s }: { name: string; s: Session }) {
  const go = useGo()
  const left = useTimeLeft(s.id, s.job ?? '')
  const low = left !== null && left <= 15 * 60
  return (
    <button onClick={() => go('clusters')} className="flex h-9 shrink-0 items-center gap-2 rounded-full bg-pill px-3
      text-sm active:bg-selected">
      <span className={`size-2 rounded-full ${s.connected ? 'bg-ok' : 'bg-warn animate-pulse'}`} />
      <span className="font-semibold">{name}</span>
      <span className={low ? 'font-semibold text-warn' : 'text-dim'}>
        {s.node ? `${s.node}${left !== null ? ` · ${leftText(left)}` : ''}` : s.connected ? 'no node' : 'connecting'}</span>
    </button>
  )
}

export function StatusStrip() {
  const { clusters, sessions } = useClusters()
  const [id] = useState(() => ++next)
  const [runs, setRuns] = useState(false)
  useEffect(() => {
    if (!owner) { owner = id; setRuns(true) }
    return () => { if (owner === id) owner = 0 }
  }, [id])
  const shown = (clusters ?? []).map((c) => [c.name.split(' (')[0], sessions[c.id]] as const)
    .filter(([, s]) => s && (s.connected || s.state === 'Requesting compute node'))
  return (
    <>
      {runs && <Watcher />}
      {!!shown.length && (
        <div className="flex shrink-0 gap-2 overflow-x-auto px-4 pb-2">
          {shown.map(([name, s]) => <Item key={s!.id} name={name} s={s!} />)}
        </div>
      )}
    </>
  )
}
