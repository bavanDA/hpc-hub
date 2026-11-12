import { Download, Settings } from 'lucide-react'
import { useEffect, useState } from 'react'

import { BUSY } from '../../types/clusters'
import { load, useClusters } from '../clusters/store'
import { FooterLine } from './FooterLine'
import { openUpdateDialog, useUpdateState } from './updates'
import type { Page } from './pages'

export function SidebarFooter({ page, onPick, onSettings }:
  { page?: Page; onPick: (p: Page) => void; onSettings: () => void }) {
  const { clusters, sessions } = useClusters()
  const update = useUpdateState()
  const newVersion = 'version' in update ? update.version ?? '' : ''  // stays until it's installed
  const [, tick] = useState(0)
  useEffect(load, [])
  useEffect(() => {  // the time left counts down between looks
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])
  const shown = (clusters ?? []).filter((c) => {
    const s = sessions[c.id]
    return s && (s.connected || s.state === 'Connected' || BUSY.includes(s.state))
  })
  return (
    <div className="shrink-0 border-t border-line px-1.5 py-2">
      {page !== 'clusters' && <>
        {shown.map((c) => <FooterLine key={c.id} c={c} s={sessions[c.id]} onPick={onPick} />)}
        {!shown.length && <p className="px-3 py-1.5 text-xs text-dim">No cluster connected</p>}
      </>}
      {newVersion && <button onClick={openUpdateDialog}
        className="mt-1 flex h-9 w-full items-center gap-3 rounded-md bg-accent px-3 text-left font-semibold
          text-on-accent hover:bg-accent-hover active:bg-accent-pressed">
        <Download size={16} />
        <span className="truncate">Update to {newVersion}</span>
      </button>}
      <button onClick={onSettings}
        className="mt-1 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-hover active:bg-pressed">
        <Settings size={16} className="text-dim" />
        <span>Settings</span>
      </button>
    </div>
  )
}
