import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { AGENT_NAMES } from '../../types/terminals'
import { shortName } from '../clusters/loginCopy'
import { useClusters } from '../clusters/store'
import { EButton } from '../e/EButton'
import { iconOf, STARTABLE } from './startable'

export function StartMenu({ onStart }: { onStart: (cluster: string, name: string, key: string) => void }) {
  const { clusters, sessions } = useClusters()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', away)
    return () => window.removeEventListener('mousedown', away)
  }, [open])
  const up = (clusters ?? []).filter((c) => sessions[c.id]?.connected)
  const where = up.length ? up : clusters ?? []
  return (
    <div ref={box} className="relative">
      <EButton kind="primary" onClick={() => setOpen(!open)} aria-expanded={open}>
        Start agent<ChevronDown size={16} /></EButton>
      {open && (
        <div role="menu" className="menu-in absolute top-full right-0 z-30 mt-1.5 min-w-[240px] rounded-xl bg-raised p-1
          shadow-[var(--shadow-menu)]">
          {where.map((c, n) => (
            <div key={c.id} className={n ? 'mt-1 border-t border-line pt-1' : ''}>
              <div className="px-3 pt-1.5 pb-1 text-xs font-semibold text-dim">{shortName(c)}</div>
              {[...STARTABLE, 'ask'].map((a) => {
                const Icon = iconOf(a)
                return (
                  <button key={a} role="menuitem" onClick={() => { setOpen(false); onStart(c.id, c.name, a === 'ask'
                    ? 'ask' : `agent:${a}`) }}
                    className="flex h-9 w-full items-center gap-3 rounded-md px-3 text-left hover:bg-hover">
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
