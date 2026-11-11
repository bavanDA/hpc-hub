// "Start agent": the desktop's menu, under its button, one group per connected cluster. Back and a tap away close it.
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { iconOf, STARTABLE } from '@shared/components/agents/startable'
import { shortName } from '@shared/components/clusters/loginCopy'
import { useClusters } from '@shared/components/clusters/store'
import { AGENT_NAMES } from '@shared/types/terminals'
import { useBackLayer } from '../../nav'
import { Button } from '../../ui'

export function StartMenu({ onStart }: { onStart: (cluster: string, name: string, key: string) => void }) {
  const { clusters, sessions } = useClusters()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useBackLayer(() => setOpen(false), open)
  useEffect(() => {
    if (!open) return
    const away = (e: Event) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', away, true)
    return () => window.removeEventListener('mousedown', away, true)
  }, [open])
  const up = (clusters ?? []).filter((c) => sessions[c.id]?.connected)
  const where = up.length ? up : clusters ?? []
  return (
    <div ref={box} className="relative">
      <Button kind="primary" onClick={() => setOpen(!open)} aria-expanded={open}>
        Start agent<ChevronDown size={16} /></Button>
      {open && (
        <div role="menu" className="menu-in absolute top-full right-0 z-30 mt-1.5 min-w-[240px] rounded-lg bg-raised
          py-1 shadow-[var(--shadow-menu)]">
          {where.map((c, n) => (
            <div key={c.id} className={n ? 'mt-1 border-t border-line pt-1' : ''}>
              <div className="px-3 pt-1.5 pb-0.5 text-xs font-semibold text-dim">{shortName(c)}</div>
              {[...STARTABLE, 'ask'].map((a) => {
                const Icon = iconOf(a)
                return (
                  <button key={a} role="menuitem" onClick={() => { setOpen(false); onStart(c.id, c.name, a === 'ask'
                    ? 'ask' : `agent:${a}`) }}
                    className="flex h-10 w-full items-center gap-3 px-3 text-left active:bg-pressed">
                    <Icon size={16} className="shrink-0 text-dim" />
                    {a === 'ask' ? 'Ask all agents' : AGENT_NAMES[a]}</button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
