import type { ReactNode } from 'react'

export function MenuGroup({ title, line = false, children }: { title?: string; line?: boolean; children: ReactNode }) {
  return (
    <div className={line ? 'mt-1 border-t border-line pt-1' : ''}>
      {title && <p className="px-3 pt-1.5 pb-1 text-xs font-semibold tracking-wide text-dim uppercase">{title}</p>}
      {children}
    </div>
  )
}
