import type { ReactNode } from 'react'

/** A titled part of the window: a small grey title over its rows. */
export function CopyStep({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pt-5">
      <h3 className="px-5 pb-1.5 text-xs font-semibold tracking-wide text-dim uppercase">{title}</h3>
      {children}
    </section>
  )
}
