// Big 'approve Duo on your phone' screen while a login waits for Duo (duo.py). It can't be closed, only cancelled.
// A push expires after about a minute, so after LATE seconds it says so and offers a new one (a fresh login).
import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button, Spinner } from '../ui'
import { copy } from './loginCopy'

const demoLate = new URLSearchParams(location.search).get('duoafter')  // design work: ?duoafter=0 shows it at once
const LATE = demoLate === null ? 60 : Number(demoLate)

export function DuoDialog({ name, onCancel, onRetry }: { name: string; onCancel: () => void; onRetry: () => void }) {
  const [start] = useState(() => Date.now())
  const [now, setNow] = useState(start)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.floor((now - start) / 1000)
  const late = s >= LATE
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
      <div role="dialog" aria-label="Duo"
        className="flex w-[460px] max-w-full flex-col items-center gap-3 rounded-2xl bg-window px-8 pb-8 pt-10
          text-center shadow-2xl">
        <Smartphone size={40} strokeWidth={1.25} className="text-dim" />
        <h2 className="mt-2 text-2xl font-bold">Approve Duo on your phone</h2>
        {late
          ? <p className="text-dim">{copy.duoLate}</p>
          : <p className="text-dim"><b className="text-text">{name}</b> is waiting.<br />
              Open Duo Mobile and tap Approve.</p>}
        {!late && <div className="mt-3"><Spinner size={40} /></div>}
        <p className="text-dim tabular-nums">Waiting {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</p>
        <div className="mt-1 flex gap-2">
          <Button onClick={onCancel}>Cancel</Button>
          {late && <Button kind="primary" onClick={onRetry}>{copy.newPush}</Button>}
        </div>
      </div>
    </div>
  )
}
