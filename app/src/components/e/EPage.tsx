import type { ReactNode } from 'react'

export function EPage({ note, actions, width = 760, children }:
  { note?: ReactNode; actions?: ReactNode; width?: number; children: ReactNode }) {
  return (
    <div style={{ maxWidth: width }} className="mx-auto flex flex-col pt-5 pb-10">
      {(note || actions) && (
        <div className="flex min-h-10 items-center gap-2 px-5 pb-4">
          <div className="min-w-0 flex-1 text-dim">{note}</div>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}
