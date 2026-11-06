import { Settings } from 'lucide-react'
import { useEffect, useState } from 'react'

import { BUSY } from '../../types/clusters'
import { load, useClusters } from '../clusters/store'
import { FooterLine } from './FooterLine'
import type { Page } from './pages'

export function SidebarFooter({ page, onPick, onSettings }:
  { page?: Page; onPick: (p: Page) => void; onSettings: () => void }) {
  const { clusters, sessions } = useClusters()
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
      <button onClick={onSettings}
        className="mt-1 flex h-9 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-hover active:bg-pressed">
        <Settings size={16} className="text-dim" />
        <span>Settings</span>
      </button>
    </div>
  )
}
