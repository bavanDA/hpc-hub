import { BookOpen, Bug, Code, Server } from 'lucide-react'
import { useEffect, useState } from 'react'

import { call } from '../../rpc'
import { EButton } from '../e/EButton'
import { openReport } from '../report/open'
import { Dialog } from '../ui/Dialog'
import { openLink } from './openLink'
import { checkUpdates, openUpdateDialog, useUpdateState } from './updates'

const DOCS = 'https://hpchub.staylazy.app'
const SOURCE = 'https://github.com/bavanDA/hpc-hub'

export function AboutDialog({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState('')
  useEffect(() => {
    call<{ version: string }>('app.version').then((v) => setVersion(v.version)).catch(() => {})
  }, [])
  const link = (label: string, icon: typeof BookOpen, run: () => void) => (
    <EButton kind="plain" small icon={icon} onClick={run}>{label}</EButton>
  )
  return (
    <Dialog title="" onClose={onClose} width={400}>
      <div className="flex flex-col items-center gap-3 pb-6 text-center">
        <div className="grid size-20 place-items-center rounded-2xl border border-line">
          <Server size={40} strokeWidth={1.5} />
        </div>
        <h2 className="mt-2 text-xl font-semibold">HPC Hub</h2>
        {version && <span className="text-sm text-dim tabular-nums">Version {version}</span>}
        <p className="font-semibold">Focus on your research, not on the cluster.</p>
        <p className="text-dim">Every HPC cluster you use, in one app: connect, get a compute node, and open VS Code,
          Claude or a terminal on it.</p>
        <UpdateLine onUpdate={() => { onClose(); openUpdateDialog() }} />
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {link('Docs', BookOpen, () => { void openLink(DOCS) })}
          {link('Source code', Code, () => { void openLink(SOURCE) })}
          {link('Report a problem', Bug, () => { onClose(); openReport({ kind: 'user' }) })}
        </div>
        <p className="text-sm text-dim">Free and open source, under the MIT license.</p>
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
