import { SquareTerminal } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

import { agentIcon } from '../agents/AgentIcon'

export function Popover({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose()
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('mousedown', away)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener('mousedown', away); window.removeEventListener('keydown', key) }
  }, [onClose])
  // Keep it inside the window
  const left = Math.min(x, window.innerWidth - 230)
  const top = Math.min(y, window.innerHeight - 200)
  return (
    <div ref={ref} style={{ left, top }}
      className="menu-in fixed z-30 flex min-w-[200px] flex-col rounded-lg bg-raised py-1 shadow-[var(--shadow-menu)]">
      {children}
    </div>
  )
}

export function MenuItem({ children, onClick, danger = false }:
  { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex min-h-9 items-center px-3 text-left hover:bg-hover active:bg-pressed ${danger ? 'text-bad' : ''}`}>
      {children}</button>
  )
}

const LOGO = new Set(['claude', 'codex', 'agy', 'cursor'])

/** An agent's own logo for its session (named hpchub-<agent>-…), a grey terminal for the rest. */
export function SessionIcon({ agent = '', session = '', size = 16 }: { agent?: string; session?: string; size?: number }) {
  const id = LOGO.has(agent) ? agent : /^hpchub-([a-z]+)-/.exec(session)?.[1] ?? ''
  const Icon = LOGO.has(id) ? agentIcon(id) : SquareTerminal
  return <Icon size={size} className="shrink-0 text-dim" />
}
