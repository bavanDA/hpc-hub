// Pieces of the Usage page: level bars and sections.
import type { ReactNode } from 'react'

/** Always neutral: the percent next to it says how full it is.
 * mine: the part that is yours, drawn stronger inside the whole. */
export function Bar({ value, mine, className = 'w-40' }:
  { value: number; mine?: number | null; share?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(value, 1))
  const part = mine == null ? null : Math.max(0, Math.min(mine, v))
  return (
    <div className={`relative h-2 shrink-0 overflow-hidden rounded-full bg-pill ${className}`}>
      <div className={`absolute inset-y-0 left-0 rounded-full bg-text ${part != null ? 'opacity-40' : ''}`}
        style={{ width: `${v * 100}%` }} />
      {part != null && <div className={`absolute inset-y-0 left-0 rounded-full bg-text`}
        style={{ width: `${part * 100}%` }} />}
    </div>
  )
}

/** A group of rows under a small grey title (style E). */
export function Section({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      {title && <h2 className="px-4 text-xs font-semibold tracking-wide text-dim uppercase">{title}</h2>}
      {note && <p className="px-4 pb-1 text-sm text-dim">{note}</p>}
      {children}
    </section>
  )
}
