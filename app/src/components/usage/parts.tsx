// Pieces of the Usage page: level bars and sections.
import type { ReactNode } from 'react'

/** Blue while there is room, orange from 75%, red from 90% (like GTK's). A share bar stays blue.
 * mine: the part that is yours, drawn stronger inside the whole. */
export function Bar({ value, mine, share = false, className = 'w-40' }:
  { value: number; mine?: number | null; share?: boolean; className?: string }) {
  const v = Math.max(0, Math.min(value, 1))
  const color = share || v <= 0.75 ? 'bg-accent' : v <= 0.9 ? 'bg-[#e66100] dark:bg-[#ffa348]' : 'bg-bad'
  const part = mine == null ? null : Math.max(0, Math.min(mine, v))
  return (
    <div className={`relative h-2 shrink-0 overflow-hidden rounded-full bg-pill ${className}`}>
      <div className={`absolute inset-y-0 left-0 rounded-full ${color} ${part != null ? 'opacity-40' : ''}`}
        style={{ width: `${v * 100}%` }} />
      {part != null && <div className={`absolute inset-y-0 left-0 rounded-full ${color}`}
        style={{ width: `${part * 100}%` }} />}
    </div>
  )
}

export function Section({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-bold">{title}</h2>
      {note && <p className="text-[13px] text-dim">{note}</p>}
      {children}
    </section>
  )
}
