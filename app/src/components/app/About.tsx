// About HPC Hub: name, version, one line (hpc_hub/app.py _about).
import { Server } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import { Dialog, Pill } from '../ui'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState('')
  useEffect(() => {
    call<{ version: string }>('app.version').then((v) => setVersion(v.version)).catch(() => {})
  }, [])
  return (
    <Dialog title="" onClose={onClose} width={360}>
      <div className="flex flex-col items-center gap-3 pb-6 text-center">
        <div className="grid size-24 place-items-center rounded-3xl bg-accent text-white shadow-lg">
          <Server size={52} strokeWidth={1.5} />
        </div>
        <h2 className="mt-2 text-2xl font-bold">HPC Hub</h2>
        {version && <Pill>{version}</Pill>}
        <p className="text-dim">Wulver, Yale and SDSC in one place.</p>
      </div>
    </Dialog>
  )
}
