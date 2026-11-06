import type { Blame } from '../../../../types/history'

export type Cell = { first: boolean; who: string; age: string; fresh: number; uncommitted: boolean } | null

/** "2h", "1d", "Oct 22": short, for the column. */
function short(ts: number): string {
  const s = Date.now() / 1000 - ts
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`
  if (s < 86400) return `${Math.floor(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function cells(b: Blame): Cell[] {
  const times = Object.values(b.commits).filter((c) => !c.uncommitted).map((c) => c.time)
  const lo = Math.min(...times), hi = Math.max(...times)
  return b.lines.map(([h], i) => {
    const c = b.commits[h]
    if (!c) return null
    return { first: i === 0 || b.lines[i - 1][0] !== h, who: c.uncommitted ? 'Not committed' : c.author,
      age: c.uncommitted ? 'now' : short(c.time), uncommitted: c.uncommitted,
      fresh: c.uncommitted ? 1 : hi > lo ? (c.time - lo) / (hi - lo) : 1 }
  })
}
