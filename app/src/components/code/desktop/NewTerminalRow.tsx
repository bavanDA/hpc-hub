import { SquareTerminal } from 'lucide-react'
import type { ReactNode } from 'react'

export function NewTerminalRow({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className="flex h-9 w-full items-center gap-3 px-3 text-left hover:bg-hover active:bg-pressed">
      <SquareTerminal size={16} className="shrink-0 text-dim" />{children}</button>
  )
}
