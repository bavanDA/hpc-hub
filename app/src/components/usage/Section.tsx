import type { ReactNode } from 'react'

export function Section({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      {title && <h2 className="px-4 text-xs font-semibold tracking-wide text-dim uppercase">{title}</h2>}
      {note && <p className="px-4 pb-1 text-sm text-dim">{note}</p>}
      {children}
    </section>
  )
}
