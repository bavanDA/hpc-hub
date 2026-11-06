import { Server } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import { Dialog } from '../ui'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState('')
  useEffect(() => {
    call<{ version: string }>('app.version').then((v) => setVersion(v.version)).catch(() => {})
  }, [])
  return (
    <Dialog title="" onClose={onClose} width={360}>
      <div className="flex flex-col items-center gap-3 pb-6 text-center">
        <div className="grid size-20 place-items-center rounded-2xl border border-line">
          <Server size={40} strokeWidth={1.5} />
        </div>
        <h2 className="mt-2 text-xl font-semibold">HPC Hub</h2>
        {version && <span className="text-sm text-dim tabular-nums">Version {version}</span>}
        <p className="text-dim">Wulver, Yale and SDSC in one place.</p>
      </div>
    </Dialog>
  )
}
