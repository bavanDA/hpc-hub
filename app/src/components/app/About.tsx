import { Server } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import { EButton } from '../e/EButton'
import { Dialog } from '../ui/Dialog'
import { checkUpdates, openUpdateDialog, useUpdateState } from './updates'

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
        <UpdateLine onUpdate={() => { onClose(); openUpdateDialog() }} />
      </div>
    </Dialog>
  )
}

function UpdateLine({ onUpdate }: { onUpdate: () => void }) {
  const s = useUpdateState()
  if (s.kind === 'available' || ((s.kind === 'downloading' || s.kind === 'installing') && s.version)) {
    return <EButton kind="primary" onClick={onUpdate}>Update to {s.version}</EButton>
  }
  return (
    <div className="flex flex-col items-center gap-1.5">
      <EButton kind="plain" small disabled={s.kind === 'checking'} onClick={() => { void checkUpdates() }}>
        {s.kind === 'checking' ? 'Checking…' : 'Check for updates'}</EButton>
      {s.kind === 'none' && <span className="text-sm text-dim">You have the newest version.</span>}
      {s.kind === 'error' && <span role="alert" className="text-sm text-bad">{s.text}</span>}
    </div>
  )
}
