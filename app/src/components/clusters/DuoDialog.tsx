import { Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'

import { EButton } from '../e/EButton'
import { Spinner } from '../ui/Spinner'
import { copy } from './loginCopy'
import { OnTop } from '../ui/OnTop'

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
    <OnTop>
      <div className="dialog-scrim fixed inset-0 z-40 grid place-items-center bg-scrim p-4">
        <div role="dialog" aria-label="Duo" className="dialog-in flex w-[440px] max-w-full flex-col items-center gap-3
          rounded-xl bg-window px-6 pt-8 pb-5 text-center shadow-[var(--shadow-dialog)]">
          <Smartphone size={40} strokeWidth={1.25} className="text-dim" />
          <h2 className="mt-1 text-xl font-semibold">Approve Duo on your phone</h2>
          {late
            ? <p className="text-dim">{copy.duoLate}</p>
            : <p className="text-dim"><b className="font-semibold text-text">{name}</b> is waiting.<br />
                Open Duo Mobile and tap Approve.</p>}
          {!late && <div className="mt-2"><Spinner size={32} /></div>}
          <p className="text-sm text-dim tabular-nums">Waiting {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</p>
          <div className="mt-3 flex w-full gap-2">
            <EButton className="flex-1" onClick={onCancel}>Stop signing in</EButton>
            {late && <EButton kind="primary" className="flex-1" onClick={onRetry}>{copy.newPush}</EButton>}
          </div>
        </div>
      </div>
    </OnTop>
  )
}
