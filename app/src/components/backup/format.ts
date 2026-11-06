import { shortName as short } from '../clusters/loginCopy'

const GB = 1024 ** 3

/** "38.2 GB", "260 GB", "1.62 TB" */
export function gb(bytes: number): string {
  const g = bytes / GB
  if (g >= 1000) return `${(g / 1024).toFixed(2)} TB`
  if (g >= 100) return `${Math.round(g)} GB`
  if (g >= 0.1) return `${g.toFixed(1)} GB`
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

/** The same for numbers already in GB (space checks). */
export function gbOf(g: number): string {
  return g >= 1000 ? `${(g / 1024).toFixed(2)} TB` : `${g >= 100 ? Math.round(g) : g.toFixed(1)} GB`
}

export function count(n: number): string {
  return n.toLocaleString('en-US')
}

/** "Wulver (NJIT)" -> "Wulver" */
export function shortName(name: string): string {
  return short({ name })
}

function day(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

/** "in 5 days, on Friday, Nov 6", "tomorrow", "any day now" */
export function when(days: number | null): string {
  if (days == null) return ''
  if (days <= 0) return 'any day now'
  if (days === 1) return 'tomorrow'
  return `in ${days} days, on ${day(days)}`
}
