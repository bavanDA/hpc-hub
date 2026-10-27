// A screen's title bar: big title, and buttons on the right.
import type { ReactNode } from 'react'

export function Header({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 px-4">
      <h1 className="min-w-0 flex-1 truncate text-2xl font-bold">{title}</h1>
      {children}
    </header>
  )
}
