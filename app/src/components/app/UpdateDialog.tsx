// A new version: what's in it, and one button that downloads, installs and restarts. Errors stay here with a way
// to get the installer by hand.
import { Download, TriangleAlert } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Bar } from '../backup/Bar'
import { EButton } from '../e/EButton'
import { EDialog } from '../e/EDialog'
import { MainButton } from '../e/MainButton'
import { useToast } from '../useToast'
import { openLink } from './openLink'
import { installUpdate, RELEASES, setOpener, startUpdateChecks, useUpdateState } from './updates'

const mb = (n: number) => `${Math.round(n / 1_000_000)} MB`

export function UpdateDialog({ onClose }: { onClose: () => void }) {
  const s = useUpdateState()
  const busy = s.kind === 'downloading' || s.kind === 'installing'
  const version = 'version' in s ? s.version : undefined
  const notes = 'notes' in s ? s.notes : ''
  return (
    <EDialog title={version ? `HPC Hub ${version}` : 'Update HPC Hub'} icon={Download}
      onClose={busy ? () => {} : onClose}
      actions={s.kind === 'error'
        ? <div className="flex w-full gap-2">
            <EButton kind="plain" className="h-11 flex-1" onClick={() => openLink(RELEASES)}>Download by hand</EButton>
            {version && <EButton kind="primary" className="h-11 flex-1" onClick={installUpdate}>Try again</EButton>}
          </div>
        : <MainButton disabled={busy || s.kind !== 'available'} onClick={installUpdate}>
            {s.kind === 'downloading' ? 'Downloading…' : s.kind === 'installing' ? 'Installing…' : 'Update and restart'}
          </MainButton>}>
      <div className="flex flex-col gap-3 px-5">
        <p>A new version of HPC Hub is ready. It installs in a minute and the app opens again by itself.</p>
        {notes && <p className="max-h-48 overflow-auto rounded-lg bg-soft px-3 py-2 text-sm whitespace-pre-wrap">{notes}</p>}
        <p className="text-sm text-dim">Your terminals, agents and jobs keep running on the clusters while it
          restarts.</p>
        {s.kind === 'downloading' && <div className="flex flex-col gap-1.5">
          <Bar value={s.total ? s.done / s.total : 0} label="Download" />
          <span className="text-sm text-dim tabular-nums">{s.total ? `${mb(s.done)} of ${mb(s.total)}` : mb(s.done)}</span>
        </div>}
        {s.kind === 'installing' && <p className="text-sm text-dim">Installing. HPC Hub restarts in a moment…</p>}
        {s.kind === 'error' && <p role="alert" className="flex items-start gap-2 rounded-lg bg-bad-bg px-3 py-2
          font-semibold text-bad"><TriangleAlert size={16} className="mt-0.5 shrink-0" />{s.text}</p>}
      </div>
    </EDialog>
  )
}

/** Mounted once in App: checks for updates and shows the window when asked. */
export function UpdateChecker() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    setOpener(() => setOpen(true))
    startUpdateChecks((version) => toast(`HPC Hub ${version} is ready to install`,
      { action: { label: 'Update', run: () => setOpen(true) } }))
    return () => setOpener(null)
  }, [toast])
  return open ? <UpdateDialog onClose={() => setOpen(false)} /> : null
}
