import type { ReactNode } from 'react'

export function MenuItem({ children, onClick, danger = false }:
  { children: ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`flex min-h-9 items-center px-3 text-left hover:bg-hover active:bg-pressed ${danger ? 'text-bad' : ''}`}>
      {children}</button>
  )
}
