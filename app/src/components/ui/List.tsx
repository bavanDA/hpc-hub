import type { ReactNode } from 'react'

export function List({ children }: { children: ReactNode }) {
  return <section className="divide-y divide-line overflow-hidden border-y border-line">{children}</section>
}
