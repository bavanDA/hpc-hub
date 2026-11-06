import type { ReactNode } from 'react'

export function List({ children }: { children: ReactNode }) {
  return <div className="border-t border-line">{children}</div>
}
