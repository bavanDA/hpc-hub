export const lastLine = (s: string) => s.trim().split('\n').pop() ?? s
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const shortHash = (h: string) => h.slice(0, 7)
export const fileName = (p: string) => p.split('/').pop() ?? p

/** jdoe -> JD, asmith -> AS, mygroup -> MG, Jane Doe -> JD. */
export function initials(name: string): string {
  const words = name.trim().split(/[\s._-]+/).filter(Boolean)
  if (words.length > 1) return (words[0][0] + words[1][0]).toUpperCase()
  const w = words[0] ?? '?'
  const rest = w.slice(1).replace(/^[aeiouy]+/i, '')
  return (w[0] + (rest[0] ?? '')).toUpperCase()
}

const time = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const day = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/** 2 min ago, 3 hours ago, Yesterday, 16:40, Oct 31, Oct 31 2024. */
export function when(ts: number, long = false): string {
  const d = new Date(ts * 1000), now = new Date(), s = (now.getTime() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)} min ago`
  if (sameDay(d, now) && s < 6 * 3600) return `${Math.floor(s / 3600)} ${Math.floor(s / 3600) === 1 ? 'hour' : 'hours'} ago`
  if (sameDay(d, now)) return long ? `today ${time(d)}` : time(d)
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (sameDay(d, y)) return long ? `Yesterday, ${time(d)}` : 'Yesterday'
  return d.getFullYear() === now.getFullYear() ? day(d) : `${day(d)} ${d.getFullYear()}`
}

/** Tue Nov 3 at 11:12 */
export function fullDate(ts: number): string {
  const d = new Date(ts * 1000)
  return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${time(d)}`
}

export const clock = (ts: number) => time(new Date(ts * 1000))

/** Today, Yesterday, October, March 2025: the list's group headings. */
export function group(ts: number): string {
  const d = new Date(ts * 1000), now = new Date()
  if (sameDay(d, now)) return 'Today'
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (sameDay(d, y)) return 'Yesterday'
  const month = d.toLocaleDateString('en-US', { month: 'long' })
  return d.getFullYear() === now.getFullYear() ? month : `${month} ${d.getFullYear()}`
}
